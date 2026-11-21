# 研究字段清单

本清单于 2026-11-19 从代码静态提取，用于核对研究方案；代码更新后需要重新核对。字段存在不代表该事件一定被触发、数据已采集或指标已验证。问卷 A 是系统推导值，问卷 B 是用户回答，两者不能互相代填。

行为指标保存在 Redis `research:auto:{user_id}`，元信息保存在 `research:auto:{user_id}:meta`，并写入 MongoDB `surveys` 集合；元信息包含规则版本、计算时间和可用时的来源事件 ID。以下只列出以字符串字面量调用 `set_auto_field` 的字段，实际统计含义、缺失策略及计算公式以列出的代码为准。

| 指标字段 | 写入位置（backend/app） |
| --- | --- |
| `A4` | `research/derive.py:248` |
| `A5-auto` | `research/derive.py:232`, `research/derive.py:514` |
| `A6-auto` | `research/derive.py:548` |
| `B1` | `research/derive.py:186`, `research/derive.py:215` |
| `B2` | `research/derive.py:183`, `research/derive.py:221` |
| `C1-auto` | `research/derive.py:242` |
| `C2-auto` | `research/derive.py:280` |
| `C3-auto` | `research/derive.py:308` |
| `E-act` | `research/derive.py:502` |
| `E-lat` | `research/derive.py:333` |
| `E3-auto` | `research/derive.py:325` |
| `E5-auto` | `research/derive.py:330` |
| `E6-auto` | `research/derive.py:342` |
| `F1-auto` | `research/derive.py:244` |
| `F2a` | `research/derive.py:349` |
| `F2c` | `research/derive.py:382` |
| `F2d` | `research/derive.py:393` |
| `F2e` | `research/derive.py:398`, `research/derive.py:415` |
| `F4c` | `research/derive.py:433` |
| `G5-auto` | `research/derive.py:438` |
| `G7` | `research/derive.py:470` |
| `H-tech` | `research/derive.py:485` |
| `H1` | `research/derive.py:563` |
| `H2` | `research/derive.py:506` |
| `H4-auto` | `research/derive.py:573` |
| `I5-auto` | `research/derive.py:224` |
| `J1` | `services/research_service.py:562` |
| `agent_disclosure_shown` | `research/derive.py:331` |
| `agent_first_reply_type` | `research/derive.py:326` |
| `agent_opt_out` | `research/derive.py:343` |
| `agent_repeat_explain` | `research/derive.py:314` |
| `answered_before_feedback` | `research/derive.py:350` |
| `churn_flag` | `research/derive.py:574` |
| `completed_practice_count` | `research/derive.py:498` |
| `consent_withdrawn` | `research/derive.py:518` |
| `content_id` | `research/derive.py:219` |
| `creator_id` | `research/derive.py:217` |
| `daily_minutes_actual` | `research/derive.py:549` |
| `entry_reselect_count` | `research/derive.py:307` |
| `entry_task_tag` | `research/derive.py:184`, `research/derive.py:222` |
| `feedback_viewed` | `research/derive.py:355`, `research/derive.py:361` |
| `first_practice_completed_at` | `research/derive.py:495` |
| `inactive_3d` | `research/derive.py:576` |
| `institution_id` | `research/derive.py:227` |
| `invitees_registered` | `research/derive.py:480` |
| `invitees_valid_practice` | `research/derive.py:611` |
| `invites_sent` | `research/derive.py:471` |
| `is_first_use` | `research/derive.py:233`, `research/derive.py:515` |
| `paid` | `research/derive.py:505` |
| `pair_answer_submitted` | `research/derive.py:457` |
| `pair_sessions_created` | `research/derive.py:454` |
| `passive_time_ratio` | `research/derive.py:405`, `research/derive.py:422` |
| `posttest_answer` | `services/research_service.py:563` |
| `posttest_status` | `services/research_service.py:564` |
| `qualified_activation` | `research/derive.py:150`, `research/derive.py:166` |
| `redundant_steps` | `research/derive.py:434` |
| `referral_qualified_invitees` | `research/derive.py:463` |
| `refunded` | `research/derive.py:509` |
| `return_sessions_7d` | `research/derive.py:564` |
| `revision_action` | `research/derive.py:381` |
| `revision_count` | `research/derive.py:385` |
| `share_card_opens` | `research/derive.py:448` |
| `share_card_with_excerpt` | `research/derive.py:443` |
| `share_object_chosen` | `research/derive.py:439` |
| `share_probe_started` | `research/derive.py:451` |
| `steps_to_first_answer` | `research/derive.py:262`, `research/derive.py:287` |
| `target_role` | `research/derive.py:249` |
| `task_steps_to_start` | `research/derive.py:197` |
| `task_time_to_start_ms` | `research/derive.py:205` |
| `tech_error_count` | `research/derive.py:486` |
| `time_to_first_answer_sec` | `research/derive.py:270`, `research/derive.py:295` |
| `variant_followups_done` | `research/derive.py:394` |
| `voluntary_activation_14d` | `research/derive.py:598` |
| `zc_assigned` | `research/derive.py:241` |
| `zc_realized` | `research/derive.py:260` |
| `zp_assigned` | `research/derive.py:243` |

动态字段另见：`research/blind_review.py:100`。盲评分数字段可能追加评分人标识，不能把不同评分人的值直接当成同一个变量。

## 用户问卷（版本 2026-11-03-v1）

答案保存在 Redis `research:survey:{user_id}` 和 MongoDB `surveys` 的 `survey:answers:{user_id}` 等文档；新记录包含回答状态、时间和题目版本。旧记录版本未知时保持未知。触发条件和频控以 `survey_engine.py` 为准。

| 题号 | 题目 | 类型 | 触发点 | 附加条件 | 反向题 |
| --- | --- | --- | --- | --- | --- |
| `A1` | 你目前的求职阶段是？ | single | `consent_granted` | — | 否 |
| `A2` | 离你最近一场面试还有多久？ | single | `consent_granted` | — | 否 |
| `A3` | 你这次最想解决的准备问题是？ | single | `consent_granted` | — | 否 |
| `A5` | 在此之前用过其他 AI 面试练习产品吗？ | single | `consent_granted` | — | 否 |
| `A7a` | 我能清楚说明自己在团队项目中承担的具体责任。 | likert7 | `consent_granted` | — | 否 |
| `A7b` | 面对没准备过的追问，我能临场组织出有条理的回答。 | likert7 | `consent_granted` | — | 否 |
| `A7c` | 我知道面试官追问一段经历时主要想确认什么。 | likert7 | `consent_granted` | — | 否 |
| `B3` | 你认为谈锋主要承诺帮你做到什么？ | single | `consent_granted` | — | 否 |
| `B4` | 这个承诺你觉得可信吗？ | likert7 | `consent_granted` | — | 否 |
| `F2b` | 我理解反馈指出的问题为什么成立。 | likert7 | `feedback_view_first` | — | 否 |
| `F3a` | 反馈指出的是我原文里能具体定位的问题。 | likert7 | `feedback_view_first` | — | 否 |
| `C1` | 【操纵检验】进入产品后，我不需要重新选择功能，就能直接练习之前关心的那个问题。 | likert7 | `report_view_first` | — | 否 |
| `C4` | 我在外部内容里看到的问题，和产品里让我练习的任务是同一件事。 | likert7 | `report_view_first` | — | 否 |
| `F1` | 【操纵检验】这次体验中，我主要是： | single | `report_view_first` | — | 否 |
| `F4a` | 练习需要我自己回忆和修改，这和我来之前的预期一致。 | likert7 | `report_dwell_or_reopen` | — | 否 |
| `F4b` | 需要我自己动脑的部分，让我觉得产品没兑现承诺。 | likert7 | `report_dwell_or_reopen` | — | 是 |
| `F5a` | 我能具体说出这次练习让我改进了哪一点。 | likert7 | `report_dwell_or_reopen` | — | 否 |
| `F3b` | 反馈没有把我没做过的事写成我做过的。 | likert7 | `second_session_complete` | — | 否 |
| `F3c` | 反馈坦白说明了哪些地方信息不足、它判断不了。 | likert7 | `second_session_complete` | — | 否 |
| `F5b` | 我分得清「回答变得更通顺」和「我真的更会回答了」。 | likert7 | `second_session_complete` | — | 否 |
| `D1` | 这些内容让我能判断谈锋是否适合我当前的问题。 | likert7 | `channel_creator_video` | entry_channel_in:creator,video | 否 |
| `D3` | 这些内容只是在重复「这个产品很好用」。 | likert7 | `channel_creator_video` | entry_channel_in:creator,video | 是 |
| `D4` | 我能分辨哪些内容是合作推广、哪些是个人经验分享。 | likert7 | `channel_creator_video` | entry_channel_in:creator,video | 否 |
| `D2` | 在进入产品前，你最后看到的一条相关内容是在讲什么问题？ | open | `channel_creator_video_day2` | entry_channel_in:creator,video | 否 |
| `D5` | 我觉得这些创作者在表达自己的真实判断，而不只是念统一的宣传话术。 | likert7 | `channel_creator_video_day2` | entry_channel_in:creator,video | 否 |
| `D6` | 看完内容后，我知道自己该先练哪类问题。 | likert7 | `channel_creator_video_day2` | entry_channel_in:creator,video | 否 |
| `E1` | 智能体第一次回复就识别出了我真正的困难。 | likert7 | `channel_agent` | entry_channel_eq:agent OR agent_used | 否 |
| `E2` | 它给的建议是我马上就能动手做的。 | likert7 | `channel_agent` | entry_channel_eq:agent OR agent_used | 否 |
| `E7` | 这次互动的时机和方式让我觉得被打扰了。 | likert7 | `channel_agent` | entry_channel_eq:agent OR agent_used | 是 |
| `I5a` | 如果不是机构组织，我自己不会来试。 | likert7 | `institution` | institution_id_present | 否 |
| `I5b` | 我参与主要是因为免费或费用低。 | likert7 | `institution` | institution_id_present | 否 |
| `I5c` | 我参与主要是因为有老师或就业指导的帮助。 | likert7 | `institution` | institution_id_present | 否 |
| `I5d` | 我介意机构看到我的个人练习内容。 | likert7 | `institution` | institution_id_present | 否 |
| `G4` | 让别人知道我在准备面试或求职，会让我有顾虑。 | likert7 | `share_click` | — | 否 |
| `H4` | 最近没来练习，主要是因为？ | single | `inactive_3d` | — | 否 |
| `J2` | 你对刚才这次回答满意吗？ | likert7 | `posttest_day7` | — | 否 |
| `F5c` | 离开这个工具之后，我也能用学到的方法回答类似问题。 | likert7 | `posttest_day7` | — | 否 |
| `F6` | 用一句话写下你学到的方法。 | open | `posttest_day7` | — | 否 |
| `G1` | 谈锋对我当前的准备任务有用。 | likert7 | `posttest_day7` | — | 否 |
| `G2` | 我愿意把谈锋推荐给有类似需要的朋友。 | likert7 | `posttest_day7` | — | 否 |
| `G3` | 我愿意公开分享自己的练习结果。 | likert7 | `posttest_day7` | — | 否 |
| `G5` | 如果要分享，你最愿意分享哪种内容？ | single | `posttest_day7` | — | 否 |
| `G6` | 哪种奖励最能让你去邀请别人？ | single | `posttest_day7` | — | 否 |
| `H3` | 你能接受的月费区间是？ | single | `posttest_day7` | — | 否 |
| `I1` | 我了解谈锋是根据什么给出反馈和评分的。 | likert7 | `posttest_day7` | — | 否 |
| `I2` | 我觉得它的反馈对我是公平的。 | likert7 | `posttest_day7` | — | 否 |
| `I3` | 我担心练习内容被用于我不知道的用途。 | likert7 | `posttest_day7` | — | 是 |
| `I4` | 我知道谁能看到我的原始回答。 | likert7 | `posttest_day7` | — | 否 |
| `C5` | 进入产品前的理解，和实际体验基本一致。 | likert7 | `posttest_day7` | — | 否 |
| `C6` | 从知道谈锋到开始第一次练习，过程顺畅。 | likert7 | `posttest_day7` | — | 否 |
| `K1` | 从看到谈锋相关内容到完成练习，哪一步最让你想放弃？ | open | `posttest_day7` | — | 否 |
| `K2` | 你会用一句什么话向朋友介绍谈锋？ | open | `posttest_day7` | — | 否 |

导出前应逐项核对事件是否真实发生、是否有知情同意、版本及缺失状态。统计页面中的探索性结果不能替代研究方案规定的正式分析。
