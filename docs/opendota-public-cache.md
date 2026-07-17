# OpenDota 高端公开局终局装备缓存

## 九格库存与版本口径

当前发布协议为 `opendota-public-items-manifest-v4` / `opendota-public-hero-v4`。
每个选手英雄局保留 OpenDota 详情接口里的固定槽位，不压缩、不重排：

- `item_0`—`item_5`：主装备栏 6 格；
- `backpack_0`—`backpack_2`：背包 3 格；
- 空槽发布为 `-1`，浏览器解码后仍显示在原来的槽位；
- 单件统计对同一选手局内的相同装备去重；二至六件套则把九个槽位作为同一个无序组合池，并保留重复装备数量。

OpenDota 记录的版本通常只有大版本（例如 `7.41`）。页面会结合比赛日期与
`patch/meta.py` 的发布时间线还原到当时实际生效的小版本（例如 `7.41d`），再使用该版本
`data/stats/<version>/items.json` 中的 `ItemCost` 与配方状态判断“成装且价格大于 1020”。
因此版本筛选、候选成装目录和组合统计使用同一套逐场版本口径。

## 生产口径

装备大数据页的公开局与职业局完全隔离。公开局先接受同时满足以下条件的候选比赛：

- OpenDota public_matches 最高平均奖章候选桶；
- lobby_type = 7（Ranked）；
- game_mode = 22（All Draft）；
- 比赛时长至少 600 秒；
- 候选阶段至少 5 名玩家有公开段位；
- 详情阶段十名玩家都必须有公开段位；
- 严重掉线或英雄缺失会整场剔除。

逐场详情复核后，比赛进入两个互斥统计组之一：

- `pure_immortal`（纯冠绝）：十人全部为 `rank_tier = 80`；
- `immortal_divine`（冠绝＋超凡）：十人只能是 `rank_tier = 80` 或
  `70–75`，并且两类段位必须同时存在。

全超凡、万古及以下、异常段位或段位缺失的比赛不进入任何组。同一场比赛
只能属于一个组；页面按所选组分别计算样本数、胜率和最终一至六件套。

OpenDota 的 /publicMatches 会把 min_rank 上限截成 75，平均奖章算法也会把
Immortal 80 映射到最高 75 桶。因此 75 只能用于发现候选，不能直接宣称比赛
属于哪一组。采集器必须继续请求 /matches/{match_id} 并复核十名玩家。

## 运行

SQLite 是断点续跑的事实库，位于：

    .cache/opendota_immortal_items.sqlite3

匿名额度下运行：

    python scripts/fetch/fetch_opendota_public_items.py --target-matches 100000

脚本会读取 OpenDota 响应头，在每日额度耗尽前停止；第二天执行同一命令会从
SQLite 游标继续，不会重复下载已经接受或拒绝的比赛。

高额度 API Key 只通过环境变量提供，禁止写入仓库、命令行参数或日志：

    $env:OPENDOTA_API_KEY = "你的密钥"
    python scripts/fetch/fetch_opendota_public_items.py --target-matches 100000

只重新生成网页分片：

    python scripts/fetch/fetch_opendota_public_items.py --export-only

小批验证：

    python scripts/fetch/fetch_opendota_public_items.py --target-matches 100000 --max-detail-requests 100

## 发布格式

浏览器不会下载包含约一百万玩家记录的单体 JSON。采集器发布：

    data/opendota_public_items.json
    data/opendota_public_items/heroes/axe.json
    data/opendota_public_items/heroes/sven.json
    data/opendota_public_items/heroes/ember_spirit.json
    ...

opendota_public_items.json 只包含总体进度、两个组各自的场数、日期、版本和每个英雄的分片地址。
用户选择英雄并点击生成分析后，页面才载入该英雄的压缩数组分片。

## 进度与成本

目标 100,000 场是两个互斥组的有效比赛总和，不是每组各 100,000 场。保留
冠绝＋超凡后，命中率会高于旧版纯冠绝口径，但仍需排除缺段位、全超凡和异常局。
匿名 OpenDota 限额约为 60 次/分钟、3,000 次/日，完整回填仍需要较长时间；
高额度 Key 才适合一次性完成。采集进度以 manifest 的
meta.matches / meta.target_matches 为准，不能用候选数冒充有效局数。
