# 职业出装数据字段契约

本契约适用于 `scripts/fetch/fetch_pro_builds.py` 及职业出装补录脚本。比赛、选手、
装备和局内事件以 `dota2_analysis` 为权威执行来源。职责判位是用户明确批准的唯一
例外：使用派生表 `dwd_dota2.dwd_match_player_positions` 的逐场分路和5分钟补刀。
该 DWD 依赖可能滞后或不准确，必须在页面元信息中持续披露。

## 查询顺序

1. 从元数据表 `pro_match_list_2` 按 `start_time` 获取页面导出的有限 `match_id`。
2. 判位先取得页面范围内涉及的 `league_id`，再从 `match_info` 获取这些联赛的完整
   比赛集合；因此位置按整届联赛计算，不随页面日期筛选实时重算。
3. 使用有限 ID 查询其他元数据表；每张表取回后立即独立去重。
4. `dota2_analysis` 局内表必须同时包含有限 `match_id`，分区表还必须使用单个精确 `dt`。
5. SQL 只读取明确字段和事件 discriminator；不使用 `DISTINCT`、窗口排名、
   `GROUP BY`、`MIN/MAX/max_by` 做去重或分析聚合。
6. 每张表在应用层按下表语义键去重后，才能连接、选时间点、计数或聚合。

## 表与字段

| 物理表 | 输出粒度 / discriminator | 读取字段 | 应用层去重键 | 转换与限制 |
|---|---|---|---|---|
| `dwd_dota2.dwd_match_player_positions` | 一场中的一个选手 | `match_id,steamid,name,team,hits_5m,lane_role` | `(match_id, steamid)` | 已批准的判位主源；`lane_role` 1/2/3 对应优势/中/劣势路，4不参与2-1-2；`hits_5m` 是5分钟正补；派生表可能滞后或不准确 |
| `pro_match_list_2` | 一场职业比赛 | `match_id, patch_version, league_id, league_name, start_time` | `match_id` | `start_time` 是近似 Unix 秒，仅投影 UTC 日期和发现比赛范围 |
| `match_info` | 一场比赛 | `match_id, radiant_team_id, radiant_team_tag, dire_team_id, dire_team_tag, end_time, league_id` | `match_id` | 身份优先使用 team ID；tag 仅展示或作为明确标记的缺失兜底；判位用 `league_id` 取得整届联赛范围 |
| `players` | 一场中的一个选手槽位 | `match_id, slot, steamid, hero_name, hero_id, persona, team, win` | `(match_id, slot)` | `steamid/hero_id` 用于身份；名称只展示；`team` 2/3 是阵营 |
| `pro_players` | 一个 Steam 账户 | `steamid, name` | `steamid` | 仅补充展示名，不用名称连接 |
| `player_intervals2` | 一个选手时间点 | `match_id, time, slot, log_index` 加页面需要的经济、KDA、坐标和统计字段 | `(match_id, log_index)` | 字符串数值在应用层失败感知转换；仅当 DWD 选手/`hits_5m` 缺失时以 `time=600` 的 `lh` 兜底；坐标不与其他坐标族混用 |
| `hero_status_update` | `type='hero_status_update'` 的英雄状态点 | `match_id, time, log_index, type, slot, items` | `(match_id, log_index)` | `items` 按物理数组解析；只查询出生、20/35/55分钟和解析终局附近的有界窗口 |
| `combat_logs` | 对应 `DOTA_COMBATLOG_*` 事件 | 每类事件仅取 `match_id,time,log_index,type` 和该事件需要的载荷字段 | `(match_id, log_index)` | `value` 只按当前 `type` 解释；布尔字面量保留空值并只把已验证的 `true` 当真 |
| `hero_ability_level` | `type='DOTA_ABILITY_LEVEL'` | `match_id,time,log_index,type,targetname,valuename,abilitylevel` | `(match_id, log_index)` | `abilitylevel` 是事件后的技能等级；按 `time,log_index` 排序 |
| `match_picks_bans` | 一次 BP 动作 | `match_id,ord,is_pick,team,hero_id` | `(match_id, ord)` | 字符串字段在应用层转换；英雄名从本地版本化 Hero ID 目录解析 |

## 外部补充

- OpenDota `lane_role`：只查询整届联赛中 DWD 聚合不能组成严格2-1-2的精确比赛。
  只有以 OpenDota 替换该队逐场分路后能恢复严格2-1-2时才采用；否则保留 DWD
  并进入纯补刀排序。OpenDota 不提供本流程的补刀值。
- OpenDota `duration`：仅用于把 `player_intervals2` 的终局原始行读取限制在
  终局附近 ±30 秒；不可用时改用比赛起止元数据的宽窗口并标记为近似。
- OpenDota `ability_upgrades_arr`：仅在某个选手局完全没有
  `hero_ability_level` 时补充真实加点顺序，不伪造升级秒数。
- OpenDota `purchase_log`：仅作为显式补录工具的末级兜底；不会提供或伪造首次使用时间。

## 缺失和冲突

- SQL 返回的原始行数、去重后行数、移除重复数和冲突键数写入
  `meta.dedup_audit`，报表总数只使用去重后数据。
- 无可靠 ingest 时间的冲突重复行使用稳定的确定性行排序保留一行，并在审计中计数。
- 字符串数值转换失败写入 `meta.conversion_failures`；空、`null`、零和 `false`
  不会在验证前合并为同一个状态。
- `slot` 只表示一场比赛中的参与者位置和连接键，不代表 Dota 1–5 号职责位置。
- 每队按出场次数、平均补刀依次排序取 Top 5；不足5人或 Top 5 任一人完全没有
  补刀时不判位。严格2-1-2时只在同路比较平均补刀；否则最终按平均补刀从高到低
  分配1–5号位。
