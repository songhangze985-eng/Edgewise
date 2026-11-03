"""Interview questions imported from handbook PDFs (auto-generated).

Re-generate:
  cd backend && python3 scripts/generate_pdf_seed.py
"""

from __future__ import annotations

SEED_PDF_IMPORT_QUESTIONS: list[dict] = [{'id': 'ALG-001',
  'lang': 'zh-CN',
  'title': 'LC 3 无重复字符的最长 子串',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 3 无重复字符的最长 子串',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC3'],
  'ideal': '中等 字节、阿里、美 团、腾讯 同向双指针滑动窗口 + 哈希表 （或 128 位 ASCII 数组）记录 字符最新下标，左指针跳跃更 新 left = max(left, '
           'map[c] + 1)。 时间 O(n) 空间 O(|Σ|)'},
 {'id': 'ALG-002',
  'lang': 'zh-CN',
  'title': 'LC 206 反转链表',
  'category': '编程题',
  'difficulty': '简单',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 206 反转链表',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC206'],
  'ideal': '简单 全大厂通用必考 迭代法（prev / curr / next 三指针原地修改指向）与 递归法均需熟练手写，注意返 回新头节点并防环。 时间 O(n) 空间 O(1)'},
 {'id': 'ALG-003',
  'lang': 'zh-CN',
  'title': 'LC 146 LRU 缓存机制',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 146 LRU 缓存机制',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC146'],
  'ideal': '中等 字节、美团、微 软、快手 哈希表 + 双向链表（带伪头尾 节点 dummyHead / dummyTail）。面试严禁直接 调库，需手写节点增删与移动 到头部。 '
           'get/put 均 O(1) 空间 O(capacity)'},
 {'id': 'ALG-004',
  'lang': 'zh-CN',
  'title': 'LC 215 数组中的第 K 个 最大元素',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 215 数组中的第 K 个 最大元素',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC215'],
  'ideal': '中等 字节、腾讯、阿 里、拼多多 快速选择算法（ QuickSelect ， 三路划分应对重复元素退化） 或维护容量为 K 的小顶堆（手 写 siftDown）。 时间期望 '
           'O(n) 空间 O(1)'},
 {'id': 'ALG-005',
  'lang': 'zh-CN',
  'title': 'LC 25 K 个一组翻转链 表',
  'category': '编程题',
  'difficulty': '困难',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 25 K 个一组翻转链 表',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC25'],
  'ideal': '困难 字节、微软、美 团、猿辅导 虚拟头节点 + 每次探测 K 个节 点边界，局部调用翻转函数后 重新拼接前驱 pre 与后继 next，不足 K 个保持原序。 时间 '
           'O(n) 空间 O(1) 排名 力扣题号与题目名称 难度 高频考察大厂 核心解题思路与手撕要点 时空复杂度'},
 {'id': 'ALG-006',
  'lang': 'zh-CN',
  'title': 'LC 15 三数之和',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 15 三数之和',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC15'],
  'ideal': '中等 字节、美团、腾 讯、百度 数组排序 + 固定第一数 + 左右 双指针夹逼。核心考点是三重 去重（i、left、right 跳过 相同元素）。 时间 O(n2) 空间 '
           'O(log n)'},
 {'id': 'ALG-007',
  'lang': 'zh-CN',
  'title': 'LC 53 最大子数组和',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 53 最大子数组和',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC53'],
  'ideal': '中等 阿里、腾讯、微 软、京东 动态规划状态压缩 cur = max(nums[i], cur + nums[i])；进阶追问：分治法 （线段树维护区间四个聚合 量）。 '
           '时间 O(n) 空间 O(1)'},
 {'id': 'ALG-008',
  'lang': 'zh-CN',
  'title': 'LC 912 手撕快速排序 / 归并排序',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 912 手撕快速排序 / 归并排序',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC912'],
  'ideal': '中等 字节、华为、腾 讯、快手 快排需随机化选取基准 （pivot） + 双路 / 三路划分； 归并排序需掌握递归合并及统 计逆序对扩展。 时间 O(n log n) 空间 '
           'O(log n)/O(n)'},
 {'id': 'ALG-009',
  'lang': 'zh-CN',
  'title': 'LC 21 合并两个有序链 表',
  'category': '编程题',
  'difficulty': '简单',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 21 合并两个有序链 表',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC21'],
  'ideal': '简单 全大厂一面热身 虚拟头节点 dummy 迭代比较拼 接，剩余非空链表直接挂载； 常作为 LC 23 合并 K 个链表及 链表归并排序的子过程。 时间 O(m + n) '
           '空间 O(1)'},
 {'id': 'ALG-010',
  'lang': 'zh-CN',
  'title': 'LC 1 两数之和',
  'category': '编程题',
  'difficulty': '简单',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 1 两数之和',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC1'],
  'ideal': '简单 全大厂通用必考 单次遍历哈希表查找 target - nums[i]，先查后存避免同 一元素重复使用。 时间 O(n) 空间 O(n)'},
 {'id': 'ALG-011',
  'lang': 'zh-CN',
  'title': 'LC 5 最长回文子串',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 5 最长回文子串',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC5'],
  'ideal': '中等 字节、华为、美 团、小米 中心扩展法（枚举奇数长度与 偶数长度中心，共 2n−1 个中心 向两侧扩展），代码最简且空 间最优。 时间 O(n2) 空间 O(1)'},
 {'id': 'ALG-012',
  'lang': 'zh-CN',
  'title': 'LC 102 二叉树的层序遍 历',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 102 二叉树的层序遍 历',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC102'],
  'ideal': '中等 字节、阿里、美 团、滴滴 BFS 队列，每层开始前记录当 前队列长度 size = q.size()，循环出队 size 次 实现按层分组。 时间 O(n) 空间 '
           'O(n)'},
 {'id': 'ALG-013',
  'lang': 'zh-CN',
  'title': 'LC 33 搜索旋转排序数 组',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 33 搜索旋转排序数 组',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC33'],
  'ideal': '中等 字节、微软、百 度、小红书 二分查找：将数组一分为二后 必有一侧绝对有序，判断 target 是否落在有序半区内， 从而收缩边界。 时间 O(log n) 空间 '
           'O(1)'},
 {'id': 'ALG-014',
  'lang': 'zh-CN',
  'title': 'LC 200 岛屿数量',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 200 岛屿数量',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC200'],
  'ideal': "中等 字节、美团、华 为、携程 网格图 DFS / BFS 染色沉岛 （将访问过的 '1' 原地置为 '0'）或并查集统计连通分量个 数。 时间 O(m × n) 空间 "
           'O(m × n)'},
 {'id': 'ALG-015',
  'lang': 'zh-CN',
  'title': 'LC 46 全排列',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 46 全排列',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC46'],
  'ideal': '中等 字节、腾讯、华 为、网易 回溯法（used 布尔数组标记已 选元素，或原地交换位置实现 O(1) 额外标记空间），进阶考 LC 47 去重剪枝。 时间 O(n × '
           'n!) 空间 O(n)'},
 {'id': 'ALG-016',
  'lang': 'zh-CN',
  'title': 'LC 236 二叉树的最近公 共祖先',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 236 二叉树的最近公 共祖先',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC236'],
  'ideal': '中等 字节、微软、阿 里、快手 后序递归：若当前节点为空或 等于 p/q 直接返回；若左右子 树返回值均非空，则当前节点 即为 LCA 。 时间 O(n) 空间 O(n) '
           '排名 力扣题号与题目名称 难度 高频考察大厂 核心解题思路与手撕要点 时空复杂度'},
 {'id': 'ALG-017',
  'lang': 'zh-CN',
  'title': 'LC 141/142 环形链表 I & II',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 141/142 环形链表 I & II',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC141'],
  'ideal': '中等 美团、腾讯、字 节、京东 快慢指针判环；相遇后将一指 针重置回 head，两指针同速每 次走一步，再次相遇点即为入 环点（数学推导 a = c ）。 时间 O(n) '
           '空间 O(1)'},
 {'id': 'ALG-018',
  'lang': 'zh-CN',
  'title': 'LC 103 二叉树的锯齿形 层序遍历',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 103 二叉树的锯齿形 层序遍历',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC103'],
  'ideal': '中等 字节、美团、阿 里、虾皮 BFS 层序遍历 + 双端队列 deque（奇数层尾插，偶数层 头插），避免对整层结果做额 外翻转。 时间 O(n) 空间 O(n)'},
 {'id': 'ALG-019',
  'lang': 'zh-CN',
  'title': 'LC 20 有效的括号',
  'category': '编程题',
  'difficulty': '简单',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 20 有效的括号',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC20'],
  'ideal': '简单 华为、腾讯、百 度、 B 站 辅助栈：遇左括号入栈（或直 接入对应右括号），遇右括号 比对栈顶；注意栈空与遍历结 束后栈非空的边界。 时间 O(n) 空间 O(n)'},
 {'id': 'ALG-020',
  'lang': 'zh-CN',
  'title': 'LC 121 买卖股票的最佳 时机',
  'category': '编程题',
  'difficulty': '简单',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 121 买卖股票的最佳 时机',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC121'],
  'ideal': '简单 字节、美团、蚂 蚁、招银 一次遍历动态维护历史最低买 入价 minPrice，同步更新最 大利润 maxProfit = max(maxProfit, p - '
           'minPrice)。 时间 O(n) 空间 O(1)'},
 {'id': 'ALG-021',
  'lang': 'zh-CN',
  'title': 'LC 92 反转链表 II',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 92 反转链表 II',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC92'],
  'ideal': '中等 字节、美团、快 手、滴滴 头插法（穿针引线）：固定前 驱 pre，在 [left, right] 区间内依次将当前节点的下一 个节点挪到 pre 之后。 时间 '
           'O(n) 空间 O(1)'},
 {'id': 'ALG-022',
  'lang': 'zh-CN',
  'title': 'LC 88 合并两个有序数 组',
  'category': '编程题',
  'difficulty': '简单',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 88 合并两个有序数 组',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC88'],
  'ideal': '简单 字节、阿里、腾 讯、微软 逆向双指针：从 nums1 尾部 （下标 m + n - 1）向前填充 较大值，避免正向覆盖未处理 元素。 时间 O(m + n) 空间 '
           'O(1)'},
 {'id': 'ALG-023',
  'lang': 'zh-CN',
  'title': 'LC 42 接雨水',
  'category': '编程题',
  'difficulty': '困难',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 42 接雨水',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC42'],
  'ideal': '困难 字节、高盛、阿 里、蔚来 必会两种解法：① 相向双指针 动态维护 leftMax / rightMax（空间 O(1) ）；② 单调递减栈按行计算凹槽水 量。 时间 '
           'O(n) 空间 O(1)'},
 {'id': 'ALG-024',
  'lang': 'zh-CN',
  'title': 'LC 23 合并 K 个升序链 表',
  'category': '编程题',
  'difficulty': '困难',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 23 合并 K 个升序链 表',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC23'],
  'ideal': '困难 字节、微软、腾 讯、猿辅导 分治归并（两两合并，共 log k 轮）或容量为 k 的最小堆（优 先队列维护 k 个链表当前头节 点）。 时间 O(N log k) '
           '空间 O(log k)/O(k)'},
 {'id': 'ALG-025',
  'lang': 'zh-CN',
  'title': 'LC 300 最长递增子序列 (LIS)',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 300 最长递增子序列 (LIS)',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC300'],
  'ideal': '中等 字节、美团、华 为、百度 常规 DP 为 O(n2)；大厂必考贪 心 + 二分查找维护单调递增尾 部数组 tails，将复杂度降至 O(n log n) 。 时间 '
           'O(n log n) 空间 O(n)'},
 {'id': 'ALG-026',
  'lang': 'zh-CN',
  'title': 'LC 56 合并区间',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 56 合并区间',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC56'],
  'ideal': '中等 字节、华为、美 团、携程 按区间左端点升序排序，遍历 时比较当前区间左端点与结果 集末尾区间右端点，重合则取 右端点最大值合并。 时间 O(n log n) 空间 '
           'O(log n) 排名 力扣题号与题目名称 难度 高频考察大厂 核心解题思路与手撕要点 时空复杂度'},
 {'id': 'ALG-027',
  'lang': 'zh-CN',
  'title': 'LC 19 删除链表的倒数 第 N 个结点',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 19 删除链表的倒数 第 N 个结点',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC19'],
  'ideal': '中等 腾讯、字节、阿 里、京东 虚拟头节点 + 快慢指针：快指 针先走 N + 1 步，随后快慢同 速前进，快指针到空时慢指针 恰停在待删节点前驱。 时间 O(n) 空间 '
           'O(1)'},
 {'id': 'ALG-028',
  'lang': 'zh-CN',
  'title': 'LC 415 字符串相加（大 数加法）',
  'category': '编程题',
  'difficulty': '简单',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 415 字符串相加（大 数加法）',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC415'],
  'ideal': '简单 字节、腾讯、阿 里、拼多多 模拟竖式加法：双指针从字符 串末尾向前遍历，维护进位 carry，循环条件为 i ≥ 0 || j ≥ 0 || carry > 0。 '
           '时间 O(max(m,n)) 空间 O(1)'},
 {'id': 'ALG-029',
  'lang': 'zh-CN',
  'title': 'LC 72 编辑距离',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 72 编辑距离',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC72'],
  'ideal': '中等 字节、百度、阿 里、智谱 二维动态规划经典母题：状态 dp[i][j] 对应增、删、改三 种状态转移，可进一步做滚动 数组空间优化。 时间 O(m × n) 空间 '
           'O(min(m,n))'},
 {'id': 'ALG-030',
  'lang': 'zh-CN',
  'title': 'LC 76 最小覆盖子串',
  'category': '编程题',
  'difficulty': '困难',
  'type': 'coding',
  'coding_language': 'javascript',
  'entry_point': 'solution',
  'problem_statement': 'LC 76 最小覆盖子串',
  'signature': 'function solution(/* args */) {\n  // 实现核心逻辑\n}',
  'starter_code': 'function solution(/* args */) {\n  \n}\n',
  'samples': [],
  'hidden_tests': [],
  'assessment_points': '考察手撕实现、复杂度分析与边界处理（摘自 CodeTop Top 30 题表）。',
  'answer_structure': '口述思路 → 编码 → 样例自测 → 时空复杂度与边界说明。',
  'tags': ['CodeTop', '手撕代码', 'LC76'],
  'ideal': '困难 字节、美团、微 软、小红书 滑动窗口进阶：维护目标字符 频次表与有效匹配计数 valid，右扩满足条件后左缩 求最短长度。 时间 O(|S| + |T|) 空间 '
           'O(|Σ|)'},
 {'id': 'ALG-T01',
  'lang': 'zh-CN',
  'title': '手撕模板：无重复字符的最长子串（ LC 3 ） —— 滑动窗口标准模板',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'python',
  'entry_point': 'solution',
  'problem_statement': '无重复字符的最长子串（ LC 3 ） —— 滑动窗口标准模板',
  'signature': 'def lengthOfLongestSubstring(s: str) -> int:\n'
               '    last_idx = {}          # 记录字符最近一次出现的下标\n'
               '    left = 0               # 滑动窗口左边界\n'
               '    max_len = 0\n'
               '    for right, ch in enumerate(s):\n'
               '        if ch in last_idx and last_idx[ch] >= left:\n'
               '            left = last_idx[ch] + 1   # 左指针直接跳过重复字符\n'
               '        last_idx[ch] = right\n'
               '        max_len = max(max_len, right - left + 1)\n'
               '    return max_len',
  'starter_code': 'def lengthOfLongestSubstring(s: str) -> int:\n'
                  '    last_idx = {}          # 记录字符最近一次出现的下标\n'
                  '    left = 0               # 滑动窗口左边界\n'
                  '    max_len = 0\n'
                  '    for right, ch in enumerate(s):\n'
                  '        if ch in last_idx and last_idx[ch] >= left:\n'
                  '            left = last_idx[ch] + 1   # 左指针直接跳过重复字符\n'
                  '        last_idx[ch] = right\n'
                  '        max_len = max(max_len, right - left + 1)\n'
                  '    return max_len',
  'samples': [],
  'hidden_tests': [],
  'tags': ['CodeTop', '手撕模板', 'Python'],
  'assessment_points': '考察标准模板能否手写并通过复杂度追问。'},
 {'id': 'ALG-T02',
  'lang': 'zh-CN',
  'title': '手撕模板：LRU 缓存机制（ LC 146 ） —— 哈希表 + 手写双向链表',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'python',
  'entry_point': 'solution',
  'problem_statement': 'LRU 缓存机制（ LC 146 ） —— 哈希表  + 手写双向链表',
  'signature': 'def __init__(self, key=0, value=0):\n'
               '        self.key, self.value = key, value\n'
               '        self.prev = self.next = None\n'
               'class LRUCache:\n'
               '    def __init__(self, capacity: int):\n'
               '        self.cache = {}\n'
               '        self.capacity = capacity\n'
               '        self.head, self.tail = DLinkedNode(), DLinkedNode()\n'
               '        self.head.next, self.tail.prev = self.tail, self.head\n'
               '    def _remove(self, node: DLinkedNode):\n'
               '        node.prev.next, node.next.prev = node.next, node.prev\n'
               '    def _add_to_head(self, node: DLinkedNode):\n'
               '        node.prev, node.next = self.head, self.head.next\n'
               '        self.head.next.prev = node\n'
               '        self.head.next = node\n'
               '    def get(self, key: int) -> int:\n'
               '        if key not in self.cache:\n'
               '            return -1\n'
               '        node = self.cache[key]\n'
               '        self._remove(node)\n'
               '        self._add_to_head(no',
  'starter_code': 'def __init__(self, key=0, value=0):\n'
                  '        self.key, self.value = key, value\n'
                  '        self.prev = self.next = None\n'
                  'class LRUCache:\n'
                  '    def __init__(self, capacity: int):\n'
                  '        self.cache = {}\n'
                  '        self.capacity = capacity\n'
                  '        self.head, self.tail = DLinkedNode(), DLinkedNode()\n'
                  '        self.head.next, self.tail.prev = self.tail, self.head\n'
                  '    def _remove(self, node: DLinkedNode):\n'
                  '        node.prev.next, node.next.prev = node.next, node.prev\n'
                  '    def _add_to_head(self, node: DLinkedNode):\n'
                  '        node.prev, node.next = self.head, self.head.next\n'
                  '        self.head.next.prev = node\n'
                  '        self.head.next = node\n'
                  '    def get(self, key: int) -> int:\n'
                  '        if key not in self.cache:\n'
                  '            return -1\n'
                  '        node = self.cache[key]\n'
                  '        self._remove(node)\n'
                  '        self._add_to_head(node)\n'
                  '        return node.value\n'
                  '    def put(self, key: int, value: int) -> None:\n'
                  '        if key in self.cache:\n'
                  '            node = self.cache[key]\n'
                  '            node.value = value\n'
                  '            self._remove(node)\n'
                  '            self._add_to_head(node)\n'
                  '        else:\n'
                  '            if len(self.cache) >= self.capacity:\n'
                  '                lru = self.tail.prev\n'
                  '                self._remove(lru)\n'
                  '                del self.cache[lru.key]\n'
                  '            new_node = DLinkedNode(key, value)\n'
                  '            self.cache[key] = new_node\n'
                  '            self._add_to_head(new_node)',
  'samples': [],
  'hidden_tests': [],
  'tags': ['CodeTop', '手撕模板', 'Python'],
  'assessment_points': '考察标准模板能否手写并通过复杂度追问。'},
 {'id': 'ALG-T03',
  'lang': 'zh-CN',
  'title': '手撕模板：K 个一组翻转链表（ LC 25 ，含 LC 206 反转链表）',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'coding',
  'coding_language': 'python',
  'entry_point': 'solution',
  'problem_statement': 'K 个一组翻转链表（ LC 25 ，含  LC 206 反转链表）',
  'signature': 'def reverseKGroup(head: ListNode, k: int) -> ListNode:\n'
               '    dummy = ListNode(0, head)\n'
               '    pre = dummy\n'
               '    while head:\n'
               '        tail = pre\n'
               '        for _ in range(k):\n'
               '            tail = tail.next\n'
               '            if not tail:\n'
               '                return dummy.next     # 剩余不足  k 个节点，保持原序\n'
               '        nxt = tail.next\n'
               '        # 翻转  [head, tail] 闭区间子链表\n'
               '        prev, curr = tail.next, head\n'
               '        while prev != tail:\n'
               '            tmp = curr.next\n'
               '            curr.next = prev\n'
               '            prev, curr = curr, tmp\n'
               '        # 重新接回原链表并推进指针\n'
               '        pre.next = tail\n'
               '        pre = head\n'
               '        head = nxt\n'
               '    return dummy.next',
  'starter_code': 'def reverseKGroup(head: ListNode, k: int) -> ListNode:\n'
                  '    dummy = ListNode(0, head)\n'
                  '    pre = dummy\n'
                  '    while head:\n'
                  '        tail = pre\n'
                  '        for _ in range(k):\n'
                  '            tail = tail.next\n'
                  '            if not tail:\n'
                  '                return dummy.next     # 剩余不足  k 个节点，保持原序\n'
                  '        nxt = tail.next\n'
                  '        # 翻转  [head, tail] 闭区间子链表\n'
                  '        prev, curr = tail.next, head\n'
                  '        while prev != tail:\n'
                  '            tmp = curr.next\n'
                  '            curr.next = prev\n'
                  '            prev, curr = curr, tmp\n'
                  '        # 重新接回原链表并推进指针\n'
                  '        pre.next = tail\n'
                  '        pre = head\n'
                  '        head = nxt\n'
                  '    return dummy.next',
  'samples': [],
  'hidden_tests': [],
  'tags': ['CodeTop', '手撕模板', 'Python'],
  'assessment_points': '考察标准模板能否手写并通过复杂度追问。'},
 {'id': 'ALG-L150-01',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 数组 / 字符串（24题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 88 合并有序数组、 LC 169 多数元素、 LC 189 轮转数组、 LC 121/122 买卖股票、 LC 55/45 跳跃游戏、 LC 238 '
           '除自身以外数组的 乘积、 LC 135 分发糖果、 LC 42 接雨水 原地修改技巧（三次翻转 法）、前缀积与后缀积预处 理、贪心最远可达边界维护。 2. 双指针与滑动 '
           '窗口 9 题 LC 11 盛最多水的容器、 LC 15 三数之和、 L 通法：C 209 长度最小的子数组、 LC 3 无重复字符 的最长子串、 LC 30 '
           '串联所有单词的子串、 LC 76 最小覆盖子串 相向双指针（利用单调性缩减 搜索空间）；同向滑动窗口 （右扩入窗、左缩出窗更新答 案）。 3. 矩阵与哈希表 14 题 LC '
           '54 螺旋矩阵、 LC 48 旋转图像、 LC 73 矩 阵置零、 LC 49 字母异位词分组、 LC 128 最 长连续序列 模拟四边界收缩、矩阵转置 + 对 '
           '称翻转、利用首行首列做',
  'tags': ['LeetCode150', '数组 / 字符串'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-02',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 双指针与滑动 窗口（9题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 11 盛最多水的容器、 LC 15 三数之和、 LC 209 长度最小的子数组、 LC 3 无重复字符 的最长子串、 LC 30 串联所有单词的子串、 '
           'LC 76 最小覆盖子串 相向双指针（利用单调性缩减 搜索空间）；同向滑动窗口 （右扩入窗、左缩出窗更新答 案）。 3. 矩阵与哈希表 14 题 LC 54 螺旋矩阵、 '
           'LC 48 旋转图像、 LC 73 矩 阵置零、 LC 49 字母异位 通法：词分组、 LC 128 最 长连续序列 模拟四边界收缩、矩阵转置 + 对 '
           '称翻转、利用首行首列做 O(1) 原地标记；哈希集合找连续序 列起点实现 O(n) 。 4. 区间与栈 9 题 LC 56 合并区间、 LC 57 插入区间、 LC 452 '
           '引爆气球、 LC 20 有效括号、 LC 155 最小 栈、 LC 150 逆波兰表达式、 LC 224 基本计算 器 区间左端点排序 merge vs 右端 '
           '点排序贪心选点；辅助栈同步 存前',
  'tags': ['LeetCode150', '双指针与滑动 窗口'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-03',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 矩阵与哈希表（14题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 54 螺旋矩阵、 LC 48 旋转图像、 LC 73 矩 阵置零、 LC 49 字母异位词分组、 LC 128 最 长连续序列 模拟四边界收缩、矩阵转置 '
           '+ 对 称翻转、利用首行首列做 O(1) 原地标记；哈希集合找连续序 列起点实现 O(n) 。 4. 区间与栈 9 题 LC 56 合并区间、 LC 57 插入区间、 LC '
           '452 引爆气球、 LC 20 有效括号、 LC 155 最小 通法：栈、 LC 150 逆波兰表达式、 LC 224 基本计算 器 区间左端点排序 merge vs 右端 '
           '点排序贪心选点；辅助栈同步 存前缀最小值；双栈法处理括 号表达式求值。 专题分类 题量 核心代表题目（力扣题号与名称） 通法模型与突破重点 5. 链表专题 11 题 LC '
           '141 环形链表、 LC 2 两数相加、 LC 138 随机链表的复制、 LC 92 反转链表 II 、 LC 25 K个一组翻转、 LC 82 删除排序链表重复元',
  'tags': ['LeetCode150', '矩阵与哈希表'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-04',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 区间与栈（9题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 56 合并区间、 LC 57 插入区间、 LC 452 引爆气球、 LC 20 有效括号、 LC 155 最小 栈、 LC 150 逆波兰表达式、 LC '
           '224 基本计算 器 区间左端点排序 merge vs 右端 点排序贪心选点；辅助栈同步 存前缀最小值；双栈法处理括 号表达式求值。 专题分类 题量 '
           '核心代表题目（力扣题号与名称） 通法模型与突破重点 5. 链表专题 11 题 LC 14 通法：1 环形链表、 LC 2 两数相加、 LC 138 随机链表的复制、 LC '
           '92 反转链表 II 、 LC 25 K个一组翻转、 LC 82 删除排序链表重复元素 II、 LC 61 旋转链表、 LC 146 LRU 凡涉及头节点可能改变必加 '
           'dummy 节点；复制复杂链表可 用哈希映射或原链表交错拆分 法。 6. 二叉树与二叉 搜索树 22 题 LC 104 最大深度、 LC 226 翻转二叉树、 LC 105 '
           '从前序与中序构造二叉树',
  'tags': ['LeetCode150', '区间与栈'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-05',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 链表专题（11题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 141 环形链表、 LC 2 两数相加、 LC 138 随机链表的复制、 LC 92 反转链表 II 、 LC 25 K个一组翻转、 LC 82 '
           '删除排序链表重复元素 II、 LC 61 旋转链表、 LC 146 LRU 凡涉及头节点可能改变必加 dummy 节点；复制复杂链表可 用哈希映射或原链表交错拆分 法。 '
           '6. 二叉树与二叉 搜索树 22 题 LC 104 最大深度、 LC 226 通法： 翻转二叉树、 LC 105 从前序与中序构造二叉树、 LC 114 展开 为链表、 '
           'LC 124 最大路径和、 LC 236 最近公 共祖先、 LC 199 右视图、 LC 98 验证 BST 、 LC 230 BST 第 K 小 区分 “ 自顶向下遍历 '
           '” 与 “ 自底向 上后序分解问题 ” ； BST 中序遍 历天然递增；构造树通过哈希 表 O(1) 定位根节点下标。 7. 图论、 BFS 与 字典树 12 题 LC '
           '200 岛屿',
  'tags': ['LeetCode150', '链表专题'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-06',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 二叉树与二叉 搜索树（22题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 104 最大深度、 LC 226 翻转二叉树、 LC 105 从前序与中序构造二叉树、 LC 114 展开 为链表、 LC 124 最大路径和、 LC '
           '236 最近公 共祖先、 LC 199 右视图、 LC 98 验证 BST 、 LC 230 BST 第 K 小 区分 “ 自顶向下遍历 ” 与 “ 自底向 上后序分解问题 '
           '” ； BST 中序遍 历天然递增；构造树通过哈希 表 O(1) 通法：定位根节点下标。 7. 图论、 BFS 与 字典树 12 题 LC 200 岛屿数量、 LC 133 '
           '克隆图、 LC 399 除法求值、 LC 207/210 课程表 I & II 、 LC 127 单词接龙、 LC 208 实现 Trie ( 前缀树 ) 、 LC 212 '
           '单词搜索 II 网格 DFS/BFS 模板、 Kahn 算 法（入度数组 + 队列）拓扑排序 判有向图环、双向 BFS 搜索最 短转换序列、 Trie 树加速多模',
  'tags': ['LeetCode150', '二叉树与二叉 搜索树'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-07',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 图论、 BFS 与 字典树（12题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 200 岛屿数量、 LC 133 克隆图、 LC 399 除法求值、 LC 207/210 课程表 I & II 、 LC 127 单词接龙、 LC '
           '208 实现 Trie ( 前缀树 ) 、 LC 212 单词搜索 II 网格 DFS/BFS 模板、 Kahn 算 法（入度数组 + 队列）拓扑排序 判有向图环、双向 '
           'BFS 搜索最 短转换序列、 Trie 树加速多模 式匹配。 8. 回溯 通法：、分治与 Kadane 13 题 LC 17 电话号码组合、 LC 77 组合、 LC 46 '
           '全 排列、 LC 39 组合总和、 LC 52 N 皇后 II 、 LC 22 括号生成、 LC 79 单词搜索、 LC 148 排序 链表、 LC 23 合并 K 链表、 '
           'LC 918 环形子数 组最大和 回溯三部曲（路径、选择列 表、结束条件）；环形数组最 大子段和 = max( 最大子段和 , 总和 - 最小子段和 )。 9. 二分查找、',
  'tags': ['LeetCode150', '图论、 BFS 与 字典树'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-08',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 回溯、分治与 Kadane（13题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 17 电话号码组合、 LC 77 组合、 LC 46 全 排列、 LC 39 组合总和、 LC 52 N 皇后 II 、 LC 22 括号生成、 LC '
           '79 单词搜索、 LC 148 排序 链表、 LC 23 合并 K 链表、 LC 918 环形子数 组最大和 回溯三部曲（路径、选择列 表、结束条件）；环形数组最 大子段和 '
           '= max( 最大子段和 , 总和 - 最小子段和 )。 9. 二 通法：分查找、堆 与位运算 16 题 LC 34 排序数组首尾位置、 LC 33 搜索旋转数 组、 LC '
           '153 旋转数组最小值、 LC 4 两个正序 数组的中位数、 LC 215 第 K 大元素、 LC 295 数据流的中位数、 LC 136/137 只出现一次的 数字 '
           '红蓝染色法统一开闭区间二 分；对顶堆（大顶堆存左半 + 小 顶堆存右半）动态维护中位 数；异或性质 a ^ a = 0 与 n & (n - 1) 消最低位 1 。 10.',
  'tags': ['LeetCode150', '回溯、分治与 Kadane'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-09',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 二分查找、堆 与位运算（16题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 34 排序数组首尾位置、 LC 33 搜索旋转数 组、 LC 153 旋转数组最小值、 LC 4 两个正序 数组的中位数、 LC 215 第 K 大元素、 '
           'LC 295 数据流的中位数、 LC 136/137 只出现一次的 数字 红蓝染色法统一开闭区间二 分；对顶堆（大顶堆存左半 + 小 顶堆存右半）动态维护中位 数；异或性质 '
           'a ^ a = 0 与 n & (n - 1) 消最低位 1 通法：。 10. 一维与多维动 态规划 20 题 LC 70 爬楼梯、 LC 198 打家劫舍、 LC 139 '
           '单 词拆分、 LC 322 零钱兑换、 LC 300 最长递增 子序列、 LC 64 最小路径和、 LC 5 最长回文 子串、 LC 97 交错字符串、 LC 72 '
           '编辑距离、 LC 188 买卖股票 IV 、 LC 221 最大正方形 背包模型（ 0-1 背包倒序遍历、 完全背包正序遍历）、状态机 DP （股票含冷冻期 / 手续费',
  'tags': ['LeetCode150', '二分查找、堆 与位运算'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-L150-10',
  'lang': 'zh-CN',
  'title': '力扣经典150 · 一维与多维动 态规划（20题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '代表题目： LC 70 爬楼梯、 LC 198 打家劫舍、 LC 139 单 词拆分、 LC 322 零钱兑换、 LC 300 最长递增 子序列、 LC 64 最小路径和、 '
           'LC 5 最长回文 子串、 LC 97 交错字符串、 LC 72 编辑距离、 LC 188 买卖股票 IV 、 LC 221 最大正方形 背包模型（ 0-1 背包倒序遍历、 '
           '完全背包正序遍历）、状态机 DP （股票含冷冻期 / 手续费 通法：/K 次 交易）、双串匹配 DP 。',
  'tags': ['LeetCode150', '一维与多维动 态规划'],
  'assessment_points': '考察该专题核心题型与通法模型是否掌握。'},
 {'id': 'ALG-ACM-01',
  'lang': 'zh-CN',
  'title': 'ACM 模式：大厂笔试输入输出与 C++/Python 模板要点',
  'category': '编程题',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '四、卡码网（ KamaCoder ）大厂笔试真题库与 ACM 模式标准模板 腾讯、阿里巴巴、字节跳动、美团、华为、京东等 30+ 家大厂的在线机试普遍采用ACM 模式（需自 '
           '行引入头文件、编写主函数、循环读取标准输入并严格按格式打印输出）。卡码网收录了大量大厂 笔试原题与输入输出专项训练，以下为笔试必备的黄金读写模板与高频真题类型。 1. '
           'ACM 模式高频输入输出场景与 C++ / Python 标准模板 // 【 C++ 万能模板】加速 IO + 处理多组不定长输入、矩阵与带空格字符串 #include '
           '<bits/stdc++.h> using namespace std; int main() { ios::sync_with_stdio(false); '
           'cin.tie(nullptr); // 场景 A ：多组输入直到文件末尾 (EOF) ，每行两个整数 int a, b; while (cin >> a >> b) { '
           'cout << a + b << "\\n"; } // 场景 B ：单行不定长整数数组（以换行符结束，常用于树 / 链表节点输入） string line; while '
           '(getline(cin, line)) { if (line.empty()) continue; stringstream ss(line); int x; '
           'vector<int> nums; while (ss >> x) nums.push_back(x); // 处理 nums ... } // 场景 C '
           '：逗号分隔的输入（如 "1,2,3,4" ） string s; if (getline(cin, s)) { stringstream ss(s); string '
           "item; vector<int> arr; while (getline(ss, item, ',')) { arr.push_back(stoi(item)); } } "
           'return 0; } # 【 Python 3 笔试高速模板】使用 sys.stdin 避免 input() 超时，提升递归深度上限 import sys '
           'sys.setrecursionlimit(200000) def solve(): # 一次性按空白符切分所有输入 Token （适合大规模图论 / 数组题） data '
           '= sys.stdin.read().split() if not data: return it = iter(data) n = int(next(it)) m = '
           'int(next(it)) edges = [] for _ in range(m): u, v, w = int(next(it)), int(next(it)), '
           'int(next(it)) edges.append((u, v, w)) # 若需按行读取不定长数据： # for line in sys.stdin: # nums = '
           "list(map(int, line.strip().split())) print(len(edges)) if __name__ == '__main__': "
           'solve() 2. 卡码网大厂笔试高频真题题型与避坑清单 笔试高频题型模块 代表大厂真题场景 核心算法模型 ACM 模式机试防挂坑 点 前缀和与差分数组 卡码网 #58 '
           '区间和、 #44 开发商购买土地 （美团 / 阿里真题） 一维 / 二维前缀和 O(1) 查询子矩阵 和；区间批量加减用差分数组还 原。 累加和极易超出 32 位 '
           '整型范围， C++ 必须 用 long long。 单调栈与单调队列 腾讯 / 字节笔试：视野 争夺、高楼看房、滑 动窗口极值 找左右第一个更大 / 更小元素用单调 '
           '栈；定长窗口最值用双端队列。 注意相等元素入栈时 取严格大于还是大于 等于，防止漏算或重 复计。 树形 DP 与换根 DP 字节 / 华为笔试：基站 建设最小成本、树上 '
           '距离和最小节点 邻接表建无向树 （vector<vector<int>> g(n+1)）， DFS 传入父节点 fa 防 回头。 笔试一般只给边集不 给 '
           'TreeNode，需手 写邻接表建图。 最短路与最小生成树 卡码网 #47 参加科学 大会（ Dijkstra ）、 #53 寻宝（ Kruskal ） 稀疏图堆优化 '
           'Dijkstra （O(E log V)）；并查集 + 边排序实现 Kruskal 。 多组测试样例必须清 空全局邻接表与 vis/dist 数组。 二分答案（最大化最 '
           '小值） 华为 / 美团笔试：芯片 负载均衡、物流运输 最小最大耗时 当答案具有单调性（耗时越多越能 完成）时，对答案值域二分 + check(mid) 贪心验证。 '
           '二分右边界 right 需 覆盖极端最大值，计 算 mid = left + (right - left) / 2。',
  'tags': ['KamaCoder', 'ACM', '笔试'],
  'assessment_points': '考察 ACM 模式下 IO 处理、边界与工程规范。'},
 {'id': 'BAGU-001',
  'lang': 'zh-CN',
  'title': 'HashMap 、 Hashtable 与 ConcurrentHashMap 的底层实现及 JDK 1.7 / 1.8 演进区别？',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': 'HashMap vs Hashtable ：HashMap 线程不安全，允许一个 null 键和多个 null 值，效率高； Hashtable 使用 '
           'synchronized 修饰全部对外方法（全表锁），不允许 null 键值，并发下性能极 差，生产环境已被淘汰。 HashMap JDK 1.8 核心结构：采用数组 + '
           '链表 + 红黑树。当链表长度达到 8 且数组容量 ≥ 64 时转为 红黑树（查找复杂度从 O(n) 降至 O(log n) ）；当红黑树节点数退化至 ≤ 6 '
           '时转回链表。插入方式由 1.7 的头插法改为尾插法，解决了并发扩容下环形链表死循环问题（但仍非线程安全，并发写会丢数据）。 ConcurrentHashMap '
           '并发优化：JDK 1.7 采用 Segment 分段锁（继承 ReentrantLock，默认并发 度 16 ）； JDK 1.8 彻底摒弃分段锁，采用 Node 数组 + '
           'CAS （无锁写入空桶） + synchronized（仅 锁住哈希桶首节点），锁粒度细化到单个桶，并引入 CounterCell 分散热点计数（类似 '
           'LongAdder）实现高性能 size() 统计。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-002',
  'lang': 'zh-CN',
  'title': '线程池的核心参数、工作流程、拒绝策略以及生产环境如何合理配置线程数？',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '七大核心参数：corePoolSize（核心线程数）、maximumPoolSize（最大线程数）、 '
           'keepAliveTime（非核心线程空闲存活时间）、unit（时间单位）、workQueue（阻塞队列）、 '
           'threadFactory（线程工厂，务必自定义命名以便排查日志）、handler（拒绝策略）。 任务提交流程：优先创建核心线程 → 核心线程满则入阻塞队列 → '
           '队列满才创建非核心线程直至达到 maximumPoolSize → 全部饱和后触发拒绝策略。注意：严禁使用 Executors.newFixedThreadPool 或 '
           'newCachedThreadPool，因其无界队列（容量 231−1 ）或 无限线程数极易引发 OOM 。 '
           '四大拒绝策略：AbortPolicy（默认，抛异常）、CallerRunsPolicy（调用者线程同步执行，具备 '
           '天然反压限流效果）、DiscardPolicy（静默丢弃）、DiscardOldestPolicy（丢弃队头最老任 务）。 参数调优原则：CPU 密集型设为 Ncpu + '
           '1； IO 密集型设为 Ncpu × (1 + WT / ST)（常用经验值 2 × Ncpu），并结合压测与动态线程池（如美团动态修改核心参数方案）实时调优。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-003',
  'lang': 'zh-CN',
  'title': 'synchronized 锁升级过程与 ReentrantLock （ AQS 原理）的核心区别？',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': 'synchronized 锁升级（不可逆）：基于对象头 Mark Word 实现。依次经历：无锁 → 偏向锁（记录线 程 ID ， JDK 15+ 默认废弃） → '
           '轻量级锁（ CAS 自旋竞争栈帧 Lock Record ） → 重量级锁（依赖操作 系统内核互斥量 mutex 与 ObjectMonitor，涉及用户态 / '
           '内核态切换）。 AQS （ AbstractQueuedSynchronizer ）核心原理：由一个 volatile int state 状态变量 + 一个 CLH '
           '双向虚拟等待队列构成。独占锁通过 CAS 修改 state，失败则封装为 Node 进入队列并调用 LockSupport.park() 挂起；相比 '
           'synchronized，ReentrantLock 支持可中断获取锁、超时获 取锁、公平 / 非公平锁切换以及绑定多个 Condition 条件队列。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-004',
  'lang': 'zh-CN',
  'title': 'ThreadLocal 的底层原理、为什么会发生内存泄漏以及如何规避？',
  'category': '专业知识',
  'difficulty': '简单',
  'type': 'professional',
  'ideal': '底层结构：每个 Thread 内部持有一个 ThreadLocalMap，其 Entry 继承自 WeakReference<ThreadLocal<?>>（ Key 是对 '
           'ThreadLocal 实例的弱引用， Value 是强引用）。 内存泄漏原因：当外部 ThreadLocal 强引用置空后， GC 会回收 Key （变为 '
           'null），但在线上线程 池复用线程的场景下，线程生命周期极长，导致链路 Thread Ref → ThreadLocalMap → Entry → Value '
           '始终存在强引用无法回收。 标准规范：将 ThreadLocal 声明为 private static final，且每次使用完毕必须在 finally 块 中显式调用 '
           'remove()。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-005',
  'lang': 'zh-CN',
  'title': 'InnoDB 为什么选择 B+ 树而不是 B 树、红黑树或哈希作为索引结构？（腾讯 / 阿里真题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '对比红黑树 / 平衡二叉树：二叉树每个节点仅存一个键值，面对千万级数据时树高超过 20 层，每次查询 触发 20+ 次磁盘随机 I/O ； B+ 树是多叉平衡树（一页默认 '
           '16KB ）， 3 层 B+ 树即可存放约 2000 万行数 据（仅需 1~3 次磁盘 I/O ）。 对比 B 树：① B+ '
           '树非叶子节点只存索引键不存行数据，单个磁盘页能容纳更多键值，扇出（ Fan-out ） 更大、树更矮胖；② B+ '
           '树所有叶子节点通过双向链表顺序连接，极度契合数据库的范围查询 （BETWEEN、>、ORDER BY），无需像 B 树那样做跨层中序回溯。 聚簇索引与回表：InnoDB '
           '主键索引即聚簇索引（叶子节点直接存完整行数据）；二级索引（非聚簇索 引）叶子节点仅存 “ 索引列值 + 主键值 ” ，查询非索引列时需再查一次主键索引（即回表）。若查询列全 '
           '部包含在二级索引中，则触发覆盖索引（ Using index ）避免回表。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-006',
  'lang': 'zh-CN',
  'title': '联合索引在什么情况下会失效？慢查询 SQL 如何系统性优化？（腾讯一面原题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '七大常见索引失效场景：① 违反最左前缀原则（跳过联合索引左侧列直接查右侧列）；② 联合索引中 间列使用了范围查询（>、<），其右侧列索引失效（注： InnoDB >= '
           '在部分值下可能继续走索引，但工 程上将范围列放联合索引最后）；③ 在索引列上做函数计算或表达式运算（如 WHERE YEAR(create_time) = 2026）；④ '
           "发生隐式类型转换（如字符串字段 varchar 未加单引号传入数 字，等价于对字段加转换函数）；⑤ 左模糊或全模糊匹配（LIKE '%abc'）；⑥ OR 前后存在未建索 "
           '引的列；⑦ 优化器判定全表扫描比走索引回表成本更低（区分度极低字段）。 慢 SQL 优化五步法：① 开启慢查询日志定位 SQL ，用 EXPLAIN 检查 '
           'type（至少达到 range/ref， 消除 ALL）、key 与 Extra（消除 Using filesort 与 Using temporary）；② '
           '建立联合索引并 利用覆盖索引；③ 深分页优化：将 LIMIT 1000000, 10 改写为延迟关联（先在二级索引子查询查出 主键 ID 再 JOIN 原表）或基于上次最大 '
           'ID 游标分页（WHERE id > last_id LIMIT 10）；④ 严 禁 SELECT * 与大事务；⑤ 读写分离、冷热数据归档或分库分表（ '
           'ShardingSphere ）。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-007',
  'lang': 'zh-CN',
  'title': 'MySQL 四大事务隔离级别、 MVCC 底层原理以及 InnoDB 如何解决幻读？',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '四大隔离级别：读未提交（ RU ，有脏读）、读已提交（ RC ，解决脏读，有不可重复读）、可重复读 （ RR ， MySQL 默认级别）、串行化（ Serializable '
           '）。 MVCC （多版本并发控制）三剑客：① 每行记录的隐藏字段（DB_TRX_ID 最近修改事务 ID 、 DB_ROLL_PTR 回滚指针）；② Undo Log '
           '版本链（历史版本串联）；③ ReadView （一致性读视 图），包含活跃事务数组 m_ids、最小活跃 ID min_trx_id、预分配 ID '
           'max_trx_id。RC 与 RR 的 核心区别在于 ReadView 生成时机：RC 在每次 SELECT 时都重新生成 ReadView ； RR 仅在事务第一 '
           '次快照读时生成并复用至事务结束。 InnoDB 解决幻读机制：快照读（普通 SELECT）依靠 MVCC 避免看到新插入行；当前读（SELECT ... FOR '
           'UPDATE / UPDATE / DELETE）依靠 Next-Key Lock （记录锁 Record Lock + 间隙锁 Gap Lock '
           '）锁住索引记录及其区间缝隙，阻止其他事务插入。注意：若在 RR 下先快照读再对他人刚插入的 行执行 UPDATE（当前读），会将隐藏 DB_TRX_ID 更新为当前事务 '
           'ID ，导致后续快照读看见该行（特 殊边界下的幻读），故需锁定读时应在事务伊始即加锁。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-008',
  'lang': 'zh-CN',
  'title': 'Spring Bean 的生命周期与三级缓存如何解决循环依赖？',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': 'Bean 生命周期主干：实例化（createBeanInstance 反射构造） → 属性注入（populateBean） → Aware '
           '接口回调（BeanNameAware / ApplicationContextAware） → BeanPostProcessor 前置处理 → '
           '初始化（InitializingBean.afterPropertiesSet 及自定义 init-method） → BeanPostProcessor 后置处理（AOP '
           '动态代理在此步生成） → 销毁（DisposableBean）。 三级缓存机制：一级缓存 singletonObjects（成品单实例）、二级缓存 '
           'earlySingletonObjects（早期半成品实例 / 代理对象）、三级缓存 singletonFactories（存放 ObjectFactory 工厂 '
           'Lambda ）。当 A 与 B 循环依赖时， A 实例化后尚未属性填充前，先将生成早期 引用的工厂放入三级缓存；若 A 需要被 AOP '
           '代理，三级缓存工厂会提前触发生成代理对象并晋升至二 级缓存，确保 B 注入的是 A 的代理对象而非原始对象。注：构造器注入与多例（prototype）循环依 '
           '赖无法通过三级缓存解决。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-009',
  'lang': 'zh-CN',
  'title': '消息队列（ Kafka / RocketMQ ）如何保证消息不丢失、不重复消费（幂等性）以及顺序消费？',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '（腾讯真题） 全链路防消息丢失：① 生产端：使用同步发送或异步回调确认， Kafka 配置 acks = all (-1) + min.insync.replicas > '
           '1；② Broker 端：开启同步刷盘（ RocketMQ SYNC_FLUSH）与主从多 副本同步复制；③ 消费端：关闭自动提交位移（enable.auto.commit '
           '= false），必须在业务逻 辑与数据库落库彻底成功后再手动提交 Offset / ACK 。 消息幂等性设计（解决重复消费）：MQ 保证的是 At-Least-Once '
           '（至少投递一次），网络抖动重传必 会导致重复消费。消费端必须实现幂等：① 唯一业务键 + 数据库唯一索引（如订单号 INSERT IGNORE）；② 乐观锁状态机更新（如 '
           "UPDATE orders SET status = 'PAID' WHERE order_id = ? AND status = 'UNPAID'）；③ Redis "
           '防重表 + 消费状态记录（若 Redis 写入后 消费者宕机，依靠数据库事务或消息重试回查自愈）。 顺序消息：将同一业务键（如同一 orderId）通过哈希取模路由到同一个 '
           'Partition / MessageQueue ， 消费端采用单线程按队列串行拉取并加本地锁消费。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-010',
  'lang': 'zh-CN',
  'title': 'TCP 三次握手 / 四次挥手、拥塞控制以及 HTTPS (TLS) 握手全过程（腾讯一面真题）',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '三次握手与四次挥手关键追问：① 为什么握手是三次？防止已失效的历史连接请求报文突然传到服务端 引起错误资源分配，且确认双方收发能力均正常；② 为什么挥手是四次？ TCP '
           '是全双工协议，服务端收 到 FIN 后先回 ACK，但服务端可能还有未发完的数据，需等数据发完再发 FIN；③ 为什么主动关闭方 需等待 2MSL （ TIME_WAIT '
           '状态）？确保最后一个 ACK 丢失时能收到服务端重发的 FIN，并让本连接 所有残余报文在网络中自然消亡。 流量控制 vs 拥塞控制：真实发送窗口 = min(rwnd '
           '接收窗口 , cwnd 拥塞窗口 )。拥塞控制四阶段： 慢启动（指数翻倍） → 拥塞避免（达到阈值 ssthresh 后线性加 1 ） → 快重传（收到 3 个重复 ACK '
           '立即重传，无需等定时器超时） → 快恢复（cwnd 减半而非重置为 1 ）。 HTTPS (TLS 1.2) 握手四步：① 客户端发 Client Hello（支持套件 + '
           '客户端随机数 R1）；② 服务 端回 Server Hello（确认套件 + 服务端随机数 R2 + 数字证书）；③ 客户端用内置 CA 公钥校验数字 '
           '证书合法性，生成预主密钥 Pre-master R3 并用证书公钥（非对称加密）发送给服务端；④ 双方利 用 R1 + R2 + R3 共同派生出对称会话密钥，后续应用层 '
           'HTTP 报文全部采用对称加密（ AES- GCM ）高速传输。',
  'tags': ['八股文', '面经', '高并发系统设计  —— 如何设计一个百万'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'BAGU-JVM-01',
  'lang': 'zh-CN',
  'title': '运行时数据区与元空间（JVM）',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '运行时数据区与元空 间 线程私有：程序计数器（唯一不会 OOM ）、虚拟机 栈、本地方法栈；线程共享：堆（存对象实例）、 方法区（ JDK 8 '
           '起由永久代改为基于本地内存的元 空间 Metaspace，存类元信息、运行时常量池；字 符串常量池移至堆中）。 为什么要把永久代替换为元空 间？（避免 PermGen '
           '固定大小 难调优及频繁 Full GC ，促成 HotSpot 与 JRockit 融合）。 垃圾回收算法与回收 器演进 新生代用标记 - 复制（ Eden : S0 : '
           'S1 = 8 : 1 : 1 ）， 老年代用标记 - 整理或标记 - 清除。回收器演进： CMS （最短停顿，并发标记清除，有内存碎片与浮动垃 圾） → G1 （ '
           'Region 分区 + 记忆集 RSet + 卡表 Card Table ，可预测停顿 STW ） → ZGC （染色指针 + 读屏障，亚毫秒级停顿）。 三色标记法出现 “ '
           '漏标 ” 的充要条 件是什么？ CMS （增量更新） 与 G1 （原始快照 SATB ）分别 如何打破该条件？ 双亲委派机制与打破 场景 加载类时先委派父加载器（ '
           'Bootstrap → Extension → Application ），父无法加载才自己加载，防止核 心 API 被篡改并避免重复加载。 如何打破双亲委派？① '
           'Tomcat 隔离多 Web 应用类库（重写 loadClass）；② JDBC SPI 机制（通过线程上下文类加载器 ThreadContextClassLoader '
           '逆向加载厂商驱动）。 高频考察专题 核心原理与面试标准答法 大厂深度追问点 线上 CPU 100% 与 OOM 排查全流程 CPU 飙高：top 查进程 PID → top '
           '-Hp <PID> 查 高耗线程 TID → printf "%x\\n" <TID> 转十六进 制 → jstack <PID> | grep -A 30 <hex> '
           '定位 死循环、频繁 GC 或锁争用代码行。 OOM 排查：配置 - XX:+HeapDumpOnOutOfMemoryError 自动导出 .hprof 文件，用 MAT '
           '/ JProfiler 查看支配树 （ Dominator Tree ）与 GC Roots 引用链。 不重启服务如何在线诊断慢方 法？（使用阿里开源 Arthas 的 '
           'thread、trace、watch、 flamegraph 火焰图命令）。 模块三： MySQL 数据库存储引擎、索引、事务与调优 Q5. InnoDB 为什么选择 B+ '
           '树而不是 B 树、红黑树或哈希作为索引结构？（腾讯 / 阿里真题） 对比红黑树 / 平衡二叉树：二叉树每个节点仅存一个键值，面对千万级数据时树高超过 20 层，每次查询 '
           '触发 20+ 次磁盘随机 I/O ； B+ 树是多叉平衡树（一页默认 16KB ）， 3 层 B+ 树即可存放约 2000 万行数 据（仅需 1~3 次磁盘 I/O ）。 '
           '对比 B 树：① B+ 树非叶子节点只存索引键不存行数据，单个磁盘页能容纳更多键值，扇出（ Fan-out ） 更大、树更矮胖；② B+ '
           '树所有叶子节点通过双向链表顺序连接，极度契合数据库的范围查询 （BETWEEN、>、ORDER BY），无需像 B 树那样做跨层中序回溯。 聚簇索引与回表：InnoDB '
           '主键索引即聚簇索引（叶子节点直接存完整行数据）；二级索引（非聚簇索 引）叶子节点仅存 “ 索引列值 + 主键值 ” ，查询非索引列时需再查一次主键索引（即回表）。若查询列全 '
           '部包含在二级索引中，则触发覆盖索引（ Using index ）避免回表。 Q6. 联合索引在什么情况下会失效？慢查询 SQL 如何系统性优化？（腾讯一面原题） '
           '七大常见索引失效场景：① 违反最左前缀原则（跳过联合索引左侧列直接查右侧列）；② 联合索引中 间列使用了范围查询（>、<），其右侧列索引失效（注： InnoDB >= '
           '在部分值下可能继续走索引，但工 程上将范围列放联合索引最后）；③ 在索引列上做函数计算或表达式运算（如 WHERE YEAR(create_time) = 2026）；④ '
           "发生隐式类型转换（如字符串字段 varchar 未加单引号传入数 字，等价于对字段加转换函数）；⑤ 左模糊或全模糊匹配（LIKE '%abc'）；⑥ OR 前后存在未建索 "
           '引的列；⑦ 优化器判定全表扫描比走索引回表成本更低（区分度极低字段）。 慢 SQL 优化五步法：① 开启慢查询日志定位 SQL ，用 EXPLAIN 检查 '
           'type（至少达到 range/ref， 消除 ALL）、key 与 Extra（消除 Using filesort 与 Using temporary）；② '
           '建立联合索引并 利用覆盖索引；③ 深分页优化：将 LIMIT 1000000, 10 改写为延迟关联（先在二级索引子查询查出 主键 ID 再 JOIN 原表）或基于上次最大 '
           'ID 游标分页（WHERE id > last_id LIMIT 10）；④ 严 禁 SELE',
  'tags': ['八股文', 'JVM', '模块二： JVM 内存模型'],
  'assessment_points': '考察 JVM 原理与线上故障排查思路。'},
 {'id': 'BAGU-JVM-02',
  'lang': 'zh-CN',
  'title': '垃圾回收算法与回收器演进（CMS/G1/ZGC）',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '垃圾回收算法与回收 器演进 新生代用标记 - 复制（ Eden : S0 : S1 = 8 : 1 : 1 ）， 老年代用标记 - 整理或标记 - 清除。回收器演进： '
           'CMS （最短停顿，并发标记清除，有内存碎片与浮动垃 圾） → G1 （ Region 分区 + 记忆集 RSet + 卡表 Card Table ，可预测停顿 STW ） '
           '→ ZGC （染色指针 + 读屏障，亚毫秒级停顿）。 三色标记法出现 “ 漏标 ” 的充要条 件是什么？ CMS （增量更新） 与 G1 （原始快照 SATB ）分别 '
           '如何打破该条件？ 双亲委派机制与打破 场景 加载类时先委派父加载器（ Bootstrap → Extension → Application '
           '），父无法加载才自己加载，防止核 心 API 被篡改并避免重复加载。 如何打破双亲委派？① Tomcat 隔离多 Web 应用类库（重写 loadClass）；② JDBC '
           'SPI 机制（通过线程上下文类加载器 ThreadContextClassLoader 逆向加载厂商驱动）。 高频考察专题 核心原理与面试标准答法 大厂深度追问点 线上 '
           'CPU 100% 与 OOM 排查全流程 CPU 飙高：top 查进程 PID → top -Hp <PID> 查 高耗线程 TID → printf "%x\\n" '
           '<TID> 转十六进 制 → jstack <PID> | grep -A 30 <hex> 定位 死循环、频繁 GC 或锁争用代码行。 OOM 排查：配置 - '
           'XX:+HeapDumpOnOutOfMemoryError 自动导出 .hprof 文件，用 MAT / JProfiler 查看支配树 （ Dominator Tree '
           '）与 GC Roots 引用链。 不重启服务如何在线诊断慢方 法？（使用阿里开源 Arthas 的 thread、trace、watch、 flamegraph '
           '火焰图命令）。 模块三： MySQL 数据库存储引擎、索引、事务与调优 Q5. InnoDB 为什么选择 B+ 树而不是 B 树、红黑树或哈希作为索引结构？（腾讯 / '
           '阿里真题） 对比红黑树 / 平衡二叉树：二叉树每个节点仅存一个键值，面对千万级数据时树高超过 20 层，每次查询 触发 20+ 次磁盘随机 I/O ； B+ '
           '树是多叉平衡树（一页默认 16KB ）， 3 层 B+ 树即可存放约 2000 万行数 据（仅需 1~3 次磁盘 I/O ）。 对比 B 树：① B+ '
           '树非叶子节点只存索引键不存行数据，单个磁盘页能容纳更多键值，扇出（ Fan-out ） 更大、树更矮胖；② B+ '
           '树所有叶子节点通过双向链表顺序连接，极度契合数据库的范围查询 （BETWEEN、>、ORDER BY），无需像 B 树那样做跨层中序回溯。 聚簇索引与回表：InnoDB '
           '主键索引即聚簇索引（叶子节点直接存完整行数据）；二级索引（非聚簇索 引）叶子节点仅存 “ 索引列值 + 主键值 ” ，查询非索引列时需再查一次主键索引（即回表）。若查询列全 '
           '部包含在二级索引中，则触发覆盖索引（ Using index ）避免回表。 Q6. 联合索引在什么情况下会失效？慢查询 SQL 如何系统性优化？（腾讯一面原题） '
           '七大常见索引失效场景：① 违反最左前缀原则（跳过联合索引左侧列直接查右侧列）；② 联合索引中 间列使用了范围查询（>、<），其右侧列索引失效（注： InnoDB >= '
           '在部分值下可能继续走索引，但工 程上将范围列放联合索引最后）；③ 在索引列上做函数计算或表达式运算（如 WHERE YEAR(create_time) = 2026）；④ '
           "发生隐式类型转换（如字符串字段 varchar 未加单引号传入数 字，等价于对字段加转换函数）；⑤ 左模糊或全模糊匹配（LIKE '%abc'）；⑥ OR 前后存在未建索 "
           '引的列；⑦ 优化器判定全表扫描比走索引回表成本更低（区分度极低字段）。 慢 SQL 优化五步法：① 开启慢查询日志定位 SQL ，用 EXPLAIN 检查 '
           'type（至少达到 range/ref， 消除 ALL）、key 与 Extra（消除 Using filesort 与 Using temporary）；② '
           '建立联合索引并 利用覆盖索引；③ 深分页优化：将 LIMIT 1000000, 10 改写为延迟关联（先在二级索引子查询查出 主键 ID 再 JOIN 原表）或基于上次最大 '
           'ID 游标分页（WHERE id > last_id LIMIT 10）；④ 严 禁 SELECT * 与大事务；⑤ 读写分离、冷热数据归档或分库分表（ '
           'ShardingSphere ）。 Q7. MySQL 四大事务隔离级别、 MVCC 底层原理以及 InnoDB 如何解决幻读？ 四大隔离级别：读未提交（ RU '
           '，有脏读）、读已提交（ RC ，解决脏读，有不可重复读）、可重复读 （ RR ， MySQL 默认级别）、串行化（ Serializable ）。 MVCC '
           '（多版本并发控制）三剑客：①',
  'tags': ['八股文', 'JVM', '模块二： JVM'],
  'assessment_points': '考察 JVM 原理与线上故障排查思路。'},
 {'id': 'BAGU-JVM-03',
  'lang': 'zh-CN',
  'title': '双亲委派机制与打破场景',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '双亲委派机制与打破 场景 加载类时先委派父加载器（ Bootstrap → Extension → Application ），父无法加载才自己加载，防止核 心 API '
           '被篡改并避免重复加载。 如何打破双亲委派？① Tomcat 隔离多 Web 应用类库（重写 loadClass）；② JDBC SPI 机制（通过线程上下文类加载器 '
           'ThreadContextClassLoader 逆向加载厂商驱动）。 高频考察专题 核心原理与面试标准答法 大厂深度追问点 线上 CPU 100% 与 OOM 排查全流程 '
           'CPU 飙高：top 查进程 PID → top -Hp <PID> 查 高耗线程 TID → printf "%x\\n" <TID> 转十六进 制 → jstack '
           '<PID> | grep -A 30 <hex> 定位 死循环、频繁 GC 或锁争用代码行。 OOM 排查：配置 - '
           'XX:+HeapDumpOnOutOfMemoryError 自动导出 .hprof 文件，用 MAT / JProfiler 查看支配树 （ Dominator Tree '
           '）与 GC Roots 引用链。 不重启服务如何在线诊断慢方 法？（使用阿里开源 Arthas 的 thread、trace、watch、 flamegraph '
           '火焰图命令）。 模块三： MySQL 数据库存储引擎、索引、事务与调优 Q5. InnoDB 为什么选择 B+ 树而不是 B 树、红黑树或哈希作为索引结构？（腾讯 / '
           '阿里真题） 对比红黑树 / 平衡二叉树：二叉树每个节点仅存一个键值，面对千万级数据时树高超过 20 层，每次查询 触发 20+ 次磁盘随机 I/O ； B+ '
           '树是多叉平衡树（一页默认 16KB ）， 3 层 B+ 树即可存放约 2000 万行数 据（仅需 1~3 次磁盘 I/O ）。 对比 B 树：① B+ '
           '树非叶子节点只存索引键不存行数据，单个磁盘页能容纳更多键值，扇出（ Fan-out ） 更大、树更矮胖；② B+ '
           '树所有叶子节点通过双向链表顺序连接，极度契合数据库的范围查询 （BETWEEN、>、ORDER BY），无需像 B 树那样做跨层中序回溯。 聚簇索引与回表：InnoDB '
           '主键索引即聚簇索引（叶子节点直接存完整行数据）；二级索引（非聚簇索 引）叶子节点仅存 “ 索引列值 + 主键值 ” ，查询非索引列时需再查一次主键索引（即回表）。若查询列全 '
           '部包含在二级索引中，则触发覆盖索引（ Using index ）避免回表。 Q6. 联合索引在什么情况下会失效？慢查询 SQL 如何系统性优化？（腾讯一面原题） '
           '七大常见索引失效场景：① 违反最左前缀原则（跳过联合索引左侧列直接查右侧列）；② 联合索引中 间列使用了范围查询（>、<），其右侧列索引失效（注： InnoDB >= '
           '在部分值下可能继续走索引，但工 程上将范围列放联合索引最后）；③ 在索引列上做函数计算或表达式运算（如 WHERE YEAR(create_time) = 2026）；④ '
           "发生隐式类型转换（如字符串字段 varchar 未加单引号传入数 字，等价于对字段加转换函数）；⑤ 左模糊或全模糊匹配（LIKE '%abc'）；⑥ OR 前后存在未建索 "
           '引的列；⑦ 优化器判定全表扫描比走索引回表成本更低（区分度极低字段）。 慢 SQL 优化五步法：① 开启慢查询日志定位 SQL ，用 EXPLAIN 检查 '
           'type（至少达到 range/ref， 消除 ALL）、key 与 Extra（消除 Using filesort 与 Using temporary）；② '
           '建立联合索引并 利用覆盖索引；③ 深分页优化：将 LIMIT 1000000, 10 改写为延迟关联（先在二级索引子查询查出 主键 ID 再 JOIN 原表）或基于上次最大 '
           'ID 游标分页（WHERE id > last_id LIMIT 10）；④ 严 禁 SELECT * 与大事务；⑤ 读写分离、冷热数据归档或分库分表（ '
           'ShardingSphere ）。 Q7. MySQL 四大事务隔离级别、 MVCC 底层原理以及 InnoDB 如何解决幻读？ 四大隔离级别：读未提交（ RU '
           '，有脏读）、读已提交（ RC ，解决脏读，有不可重复读）、可重复读 （ RR ， MySQL 默认级别）、串行化（ Serializable ）。 MVCC '
           '（多版本并发控制）三剑客：① 每行记录的隐藏字段（DB_TRX_ID 最近修改事务 ID 、 DB_ROLL_PTR 回滚指针）；② Undo Log '
           '版本链（历史版本串联）；③ ReadView （一致性读视 图），包含活跃事务数组 m_ids、最小活跃 ID min_trx_id、预分配 ID '
           'max_trx_id。RC 与 RR 的 核心区别在于 ReadView 生成时机：RC 在每次 SELECT 时都重新生成 ReadView ； RR 仅在事务第一 '
           '次快照读时生成并复用至事务结束。 InnoDB 解决幻读机制：快照读（普通 S',
  'tags': ['八股文', 'JVM', '模块二： JVM'],
  'assessment_points': '考察 JVM 原理与线上故障排查思路。'},
 {'id': 'BAGU-JVM-04',
  'lang': 'zh-CN',
  'title': '线上 CPU 100% 与 OOM 排查全流程',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '',
  'tags': ['八股文', 'JVM', '模块二： JVM'],
  'assessment_points': '考察 JVM 原理与线上故障排查思路。'},
 {'id': 'BAGU-REDIS-01',
  'lang': 'zh-CN',
  'title': 'Redis ZSet 为什么用跳表而不是红黑树？',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': 'Redis 高并发缓存架构、持久化与分布式一致性 核心面试题 面试官期待的标准工程解答 ZSet 底层为什么用跳 表（ SkipList ）而非红 黑树 /B+ 树？ '
           'ZSet 在元素数量 < 128 且每个元素长度 < 64 字节时用紧凑列表 listpack（老版本为 ziplist），否则用哈希表（ O(1) 单点查分值） + '
           '跳表（ O(log N) 排序与范围查 找）。选跳表是因为：① 跳表范围查询（ZRANGE）只需定位起点后沿最底层双向链表 遍历，比红黑树更简单高效；② 跳表插入 / '
           '删除只需修改局部指针，无需红黑树复杂的 旋转变色平衡；③ 内存场景无磁盘页对齐约束，无需 B+ 树。 Redis 持久化 RDB 、 AOF 与混合持久化如 何权衡？ '
           'RDB ：bgsave 派生子进程利用操作系统写时复制（ Copy-On-Write ）生成二进制快 照，恢复极快但可能丢失近几分钟数据（注意 AOF 重写或 RDB '
           '期间若写流量极大， COW 会引发内存翻倍甚至 OOM ）。AOF ：记录每条写命令并按 appendfsync everysec 刷盘，最多丢 1 '
           '秒数据但文件大、重放慢。生产标准（ Redis 4.0+ ）：开启 混合持久化， AOF 重写时先写入 RDB 二进制头部，再追加增量 AOF 命令，兼顾秒级 '
           '安全与极速恢复。 缓存穿透、缓存击 穿、缓存雪崩的区别 与治理方案？（腾讯 / 字节必考） 1. 缓存穿透（查根本不存在的数据，绕过缓存直击 DB ）：① '
           '网关层参数合法性校验； ② 缓存空对象（设置短过期时间如 30s ）；③ 布隆过滤器（ BloomFilter ）前置拦截不 存在的 Key 。 2. '
           '缓存击穿（单个超高并发热点 Key 突然过期）：① 互斥锁（分布式锁），仅允许一 个线程回源查 DB 重建缓存，其余等待重试；② 逻辑过期（永不过期）， Value 中内嵌 '
           '逻辑过期时间戳，发现过期时异步线程池重建，当前请求立即返回旧值。 3. 缓存雪崩（大批 Key 同一时刻集中过期或 Redis 集群宕机）：① 基础 TTL 加上随 '
           '机抖动值（如 300 + random(0, 60) 秒）；② 引入本地缓存（ Caffeine ） + Redis 多级缓存架构；③ Redis Sentinel / '
           'Cluster 高可用 + Sentinel/Resilience4j 限流降级熔 断。 Redis 与 MySQL 如何 保证双写一致性？ （腾讯一面第 1 题） '
           '绝大多数互联网业务追求最终一致性（若要求强一致必须加读写分布式锁，丧失缓存高 并发意义）： 方案一（ Cache-Aside '
           '旁路缓存标准方案）：先更新数据库，再删除缓存。为什么不 先删缓存再更新 DB ？因为在并发读写下， “A 删缓存 → B 读缓存未命中查旧 DB 并回 写旧值 → A 更新 '
           'DB” 会导致缓存长期驻留脏数据；而 “ 先改 DB 再删缓存 ” 出现脏数据的 前提是 “ 缓存恰巧失效 + 读操作比写操作更慢 ” ，概率极低。 '
           '方案二（延迟双删）：先删缓存 → 更新 DB → 休眠几百毫秒再删一次缓存（兜底并发 读回写的脏数据）。 方案三（阿里 Canal + RocketMQ '
           '异步解耦）：业务代码只管更新 MySQL ，通过 Canal 伪装成 MySQL 从库订阅 Binlog 日志投递至 MQ ，由消费者异步删除 / 更新 Redis '
           '，失败则利用 MQ 重试队列保证最终一致。 模块五： Spring 框架、消息队列（ MQ ）与计算机网络 Q8. Spring Bean '
           '的生命周期与三级缓存如何解决循环依赖？ Bean 生命周期主干：实例化（createBeanInstance 反射构造） → 属性注入（populateBean） → '
           'Aware 接口回调（BeanNameAware / ApplicationContextAware） → BeanPostProcessor 前置处理 → '
           '初始化（InitializingBean.afterPropertiesSet 及自定义 init-method） → BeanPostProcessor 后置处理（AOP '
           '动态代理在此步生成） → 销毁（DisposableBean）。 三级缓存机制：一级缓存 singletonObjects（成品单实例）、二级缓存 '
           'earlySingletonObjects（早期半成品实例 / 代理对象）、三级缓存 singletonFactories（存放 ObjectFactory 工厂 '
           'Lambda ）。当 A 与 B 循环依赖时， A 实例化后尚未属性填充前，先将生成早期 引用的工厂放入三级缓存；若 A 需要被 AOP '
           '代理，三级缓存工厂会提前触发生成代理对象并晋升至二 级缓存，确保 B 注入的是 A 的代理对象而非原始对象。注：构造器注入与多例（prototype）循环依 '
           '赖无法通过三级缓存解决。 Q9. 消息队列（ Kafka / RocketMQ ）如何保证消息不丢失、不重复消费（',
  'tags': ['八股文', 'Redis', '模块四： Redis'],
  'assessment_points': '考察 Redis 高并发架构与一致性工程方案。'},
 {'id': 'BAGU-REDIS-02',
  'lang': 'zh-CN',
  'title': 'Redis 持久化：RDB、AOF 与混合持久化如何权衡？',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': 'Redis 高并发缓存架构、持久化与分布式一致性 核心面试题 面试官期待的标准工程解答 ZSet 底层为什么用跳 表（ SkipList ）而非红 黑树 /B+ 树？ '
           'ZSet 在元素数量 < 128 且每个元素长度 < 64 字节时用紧凑列表 listpack（老版本为 ziplist），否则用哈希表（ O(1) 单点查分值） + '
           '跳表（ O(log N) 排序与范围查 找）。选跳表是因为：① 跳表范围查询（ZRANGE）只需定位起点后沿最底层双向链表 遍历，比红黑树更简单高效；② 跳表插入 / '
           '删除只需修改局部指针，无需红黑树复杂的 旋转变色平衡；③ 内存场景无磁盘页对齐约束，无需 B+ 树。 Redis 持久化 RDB 、 AOF 与混合持久化如 何权衡？ '
           'RDB ：bgsave 派生子进程利用操作系统写时复制（ Copy-On-Write ）生成二进制快 照，恢复极快但可能丢失近几分钟数据（注意 AOF 重写或 RDB '
           '期间若写流量极大， COW 会引发内存翻倍甚至 OOM ）。AOF ：记录每条写命令并按 appendfsync everysec 刷盘，最多丢 1 '
           '秒数据但文件大、重放慢。生产标准（ Redis 4.0+ ）：开启 混合持久化， AOF 重写时先写入 RDB 二进制头部，再追加增量 AOF 命令，兼顾秒级 '
           '安全与极速恢复。 缓存穿透、缓存击 穿、缓存雪崩的区别 与治理方案？（腾讯 / 字节必考） 1. 缓存穿透（查根本不存在的数据，绕过缓存直击 DB ）：① '
           '网关层参数合法性校验； ② 缓存空对象（设置短过期时间如 30s ）；③ 布隆过滤器（ BloomFilter ）前置拦截不 存在的 Key 。 2. '
           '缓存击穿（单个超高并发热点 Key 突然过期）：① 互斥锁（分布式锁），仅允许一 个线程回源查 DB 重建缓存，其余等待重试；② 逻辑过期（永不过期）， Value 中内嵌 '
           '逻辑过期时间戳，发现过期时异步线程池重建，当前请求立即返回旧值。 3. 缓存雪崩（大批 Key 同一时刻集中过期或 Redis 集群宕机）：① 基础 TTL 加上随 '
           '机抖动值（如 300 + random(0, 60) 秒）；② 引入本地缓存（ Caffeine ） + Redis 多级缓存架构；③ Redis Sentinel / '
           'Cluster 高可用 + Sentinel/Resilience4j 限流降级熔 断。 Redis 与 MySQL 如何 保证双写一致性？ （腾讯一面第 1 题） '
           '绝大多数互联网业务追求最终一致性（若要求强一致必须加读写分布式锁，丧失缓存高 并发意义）： 方案一（ Cache-Aside '
           '旁路缓存标准方案）：先更新数据库，再删除缓存。为什么不 先删缓存再更新 DB ？因为在并发读写下， “A 删缓存 → B 读缓存未命中查旧 DB 并回 写旧值 → A 更新 '
           'DB” 会导致缓存长期驻留脏数据；而 “ 先改 DB 再删缓存 ” 出现脏数据的 前提是 “ 缓存恰巧失效 + 读操作比写操作更慢 ” ，概率极低。 '
           '方案二（延迟双删）：先删缓存 → 更新 DB → 休眠几百毫秒再删一次缓存（兜底并发 读回写的脏数据）。 方案三（阿里 Canal + RocketMQ '
           '异步解耦）：业务代码只管更新 MySQL ，通过 Canal 伪装成 MySQL 从库订阅 Binlog 日志投递至 MQ ，由消费者异步删除 / 更新 Redis '
           '，失败则利用 MQ 重试队列保证最终一致。 模块五： Spring 框架、消息队列（ MQ ）与计算机网络 Q8. Spring Bean '
           '的生命周期与三级缓存如何解决循环依赖？ Bean 生命周期主干：实例化（createBeanInstance 反射构造） → 属性注入（populateBean） → '
           'Aware 接口回调（BeanNameAware / ApplicationContextAware） → BeanPostProcessor 前置处理 → '
           '初始化（InitializingBean.afterPropertiesSet 及自定义 init-method） → BeanPostProcessor 后置处理（AOP '
           '动态代理在此步生成） → 销毁（DisposableBean）。 三级缓存机制：一级缓存 singletonObjects（成品单实例）、二级缓存 '
           'earlySingletonObjects（早期半成品实例 / 代理对象）、三级缓存 singletonFactories（存放 ObjectFactory 工厂 '
           'Lambda ）。当 A 与 B 循环依赖时， A 实例化后尚未属性填充前，先将生成早期 引用的工厂放入三级缓存；若 A 需要被 AOP '
           '代理，三级缓存工厂会提前触发生成代理对象并晋升至二 级缓存，确保 B 注入的是 A 的代理对象而非原始对象。注：构造器注入与多例（prototype）循环依 '
           '赖无法通过三级缓存解决。 Q9. 消息队列（ Kafka / RocketMQ ）如何保证消息不丢失、不重复消费（',
  'tags': ['八股文', 'Redis', '模块四： Redis'],
  'assessment_points': '考察 Redis 高并发架构与一致性工程方案。'},
 {'id': 'BAGU-REDIS-03',
  'lang': 'zh-CN',
  'title': '缓存穿透、缓存击穿、缓存雪崩的区别与治理方案',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '缓存穿透、缓存击 穿、缓存雪崩的区别 与治理方案？（腾讯 / 字节必考） 1. 缓存穿透（查根本不存在的数据，绕过缓存直击 DB ）：① 网关层参数合法性校验； ② '
           '缓存空对象（设置短过期时间如 30s ）；③ 布隆过滤器（ BloomFilter ）前置拦截不 存在的 Key 。 2. 缓存击穿（单个超高并发热点 Key '
           '突然过期）：① 互斥锁（分布式锁），仅允许一 个线程回源查 DB 重建缓存，其余等待重试；② 逻辑过期（永不过期）， Value 中内嵌 '
           '逻辑过期时间戳，发现过期时异步线程池重建，当前请求立即返回旧值。 3. 缓存雪崩（大批 Key 同一时刻集中过期或 Redis 集群宕机）：① 基础 TTL 加上随 '
           '机抖动值（如 300 + random(0, 60) 秒）；② 引入本地缓存（ Caffeine ） + Redis 多级缓存架构；③ Redis Sentinel / '
           'Cluster 高可用 + Sentinel/Resilience4j 限流降级熔 断。 Redis 与 MySQL 如何 保证双写一致性？ （腾讯一面第 1 题） '
           '绝大多数互联网业务追求最终一致性（若要求强一致必须加读写分布式锁，丧失缓存高 并发意义）： 方案一（ Cache-Aside '
           '旁路缓存标准方案）：先更新数据库，再删除缓存。为什么不 先删缓存再更新 DB ？因为在并发读写下， “A 删缓存 → B 读缓存未命中查旧 DB 并回 写旧值 → A 更新 '
           'DB” 会导致缓存长期驻留脏数据；而 “ 先改 DB 再删缓存 ” 出现脏数据的 前提是 “ 缓存恰巧失效 + 读操作比写操作更慢 ” ，概率极低。 '
           '方案二（延迟双删）：先删缓存 → 更新 DB → 休眠几百毫秒再删一次缓存（兜底并发 读回写的脏数据）。 方案三（阿里 Canal + RocketMQ '
           '异步解耦）：业务代码只管更新 MySQL ，通过 Canal 伪装成 MySQL 从库订阅 Binlog 日志投递至 MQ ，由消费者异步删除 / 更新 Redis '
           '，失败则利用 MQ 重试队列保证最终一致。 模块五： Spring 框架、消息队列（ MQ ）与计算机网络 Q8. Spring Bean '
           '的生命周期与三级缓存如何解决循环依赖？ Bean 生命周期主干：实例化（createBeanInstance 反射构造） → 属性注入（populateBean） → '
           'Aware 接口回调（BeanNameAware / ApplicationContextAware） → BeanPostProcessor 前置处理 → '
           '初始化（InitializingBean.afterPropertiesSet 及自定义 init-method） → BeanPostProcessor 后置处理（AOP '
           '动态代理在此步生成） → 销毁（DisposableBean）。 三级缓存机制：一级缓存 singletonObjects（成品单实例）、二级缓存 '
           'earlySingletonObjects（早期半成品实例 / 代理对象）、三级缓存 singletonFactories（存放 ObjectFactory 工厂 '
           'Lambda ）。当 A 与 B 循环依赖时， A 实例化后尚未属性填充前，先将生成早期 引用的工厂放入三级缓存；若 A 需要被 AOP '
           '代理，三级缓存工厂会提前触发生成代理对象并晋升至二 级缓存，确保 B 注入的是 A 的代理对象而非原始对象。注：构造器注入与多例（prototype）循环依 '
           '赖无法通过三级缓存解决。 Q9. 消息队列（ Kafka / RocketMQ ）如何保证消息不丢失、不重复消费（幂等性）以及顺序消费？ （腾讯真题） 全链路防消息丢失：① '
           '生产端：使用同步发送或异步回调确认， Kafka 配置 acks = all (-1) + min.insync.replicas > 1；② Broker '
           '端：开启同步刷盘（ RocketMQ SYNC_FLUSH）与主从多 副本同步复制；③ 消费端：关闭自动提交位移（enable.auto.commit = '
           'false），必须在业务逻 辑与数据库落库彻底成功后再手动提交 Offset / ACK 。 消息幂等性设计（解决重复消费）：MQ 保证的是 At-Least-Once '
           '（至少投递一次），网络抖动重传必 会导致重复消费。消费端必须实现幂等：① 唯一业务键 + 数据库唯一索引（如订单号 INSERT IGNORE）；② 乐观锁状态机更新（如 '
           "UPDATE orders SET status = 'PAID' WHERE order_id = ? AND status = 'UNPAID'）；③ Redis "
           '防重表 + 消费状态记录（若 Redis 写入后 消费者宕机，依靠数据库事务或消息重试回查自愈）。 顺序消息：将同一业务键（如同一 orderId）通过哈希取模路由到同一个 '
           'Partition / MessageQueue ， 消费端采用单线程按队列串行拉取并加本地锁消费。 Q10',
  'tags': ['八股文', 'Redis', '模块四： Redis'],
  'assessment_points': '考察 Redis 高并发架构与一致性工程方案。'},
 {'id': 'BAGU-REDIS-04',
  'lang': 'zh-CN',
  'title': 'Redis 与 MySQL 如何保证双写一致性？',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': 'Redis 高并发缓存架构、持久化与分布式一致性 核心面试题 面试官期待的标准工程解答 ZSet 底层为什么用跳 表（ SkipList ）而非红 黑树 /B+ 树？ '
           'ZSet 在元素数量 < 128 且每个元素长度 < 64 字节时用紧凑列表 listpack（老版本为 ziplist），否则用哈希表（ O(1) 单点查分值） + '
           '跳表（ O(log N) 排序与范围查 找）。选跳表是因为：① 跳表范围查询（ZRANGE）只需定位起点后沿最底层双向链表 遍历，比红黑树更简单高效；② 跳表插入 / '
           '删除只需修改局部指针，无需红黑树复杂的 旋转变色平衡；③ 内存场景无磁盘页对齐约束，无需 B+ 树。 Redis 持久化 RDB 、 AOF 与混合持久化如 何权衡？ '
           'RDB ：bgsave 派生子进程利用操作系统写时复制（ Copy-On-Write ）生成二进制快 照，恢复极快但可能丢失近几分钟数据（注意 AOF 重写或 RDB '
           '期间若写流量极大， COW 会引发内存翻倍甚至 OOM ）。AOF ：记录每条写命令并按 appendfsync everysec 刷盘，最多丢 1 '
           '秒数据但文件大、重放慢。生产标准（ Redis 4.0+ ）：开启 混合持久化， AOF 重写时先写入 RDB 二进制头部，再追加增量 AOF 命令，兼顾秒级 '
           '安全与极速恢复。 缓存穿透、缓存击 穿、缓存雪崩的区别 与治理方案？（腾讯 / 字节必考） 1. 缓存穿透（查根本不存在的数据，绕过缓存直击 DB ）：① '
           '网关层参数合法性校验； ② 缓存空对象（设置短过期时间如 30s ）；③ 布隆过滤器（ BloomFilter ）前置拦截不 存在的 Key 。 2. '
           '缓存击穿（单个超高并发热点 Key 突然过期）：① 互斥锁（分布式锁），仅允许一 个线程回源查 DB 重建缓存，其余等待重试；② 逻辑过期（永不过期）， Value 中内嵌 '
           '逻辑过期时间戳，发现过期时异步线程池重建，当前请求立即返回旧值。 3. 缓存雪崩（大批 Key 同一时刻集中过期或 Redis 集群宕机）：① 基础 TTL 加上随 '
           '机抖动值（如 300 + random(0, 60) 秒）；② 引入本地缓存（ Caffeine ） + Redis 多级缓存架构；③ Redis Sentinel / '
           'Cluster 高可用 + Sentinel/Resilience4j 限流降级熔 断。 Redis 与 MySQL 如何 保证双写一致性？ （腾讯一面第 1 题） '
           '绝大多数互联网业务追求最终一致性（若要求强一致必须加读写分布式锁，丧失缓存高 并发意义）： 方案一（ Cache-Aside '
           '旁路缓存标准方案）：先更新数据库，再删除缓存。为什么不 先删缓存再更新 DB ？因为在并发读写下， “A 删缓存 → B 读缓存未命中查旧 DB 并回 写旧值 → A 更新 '
           'DB” 会导致缓存长期驻留脏数据；而 “ 先改 DB 再删缓存 ” 出现脏数据的 前提是 “ 缓存恰巧失效 + 读操作比写操作更慢 ” ，概率极低。 '
           '方案二（延迟双删）：先删缓存 → 更新 DB → 休眠几百毫秒再删一次缓存（兜底并发 读回写的脏数据）。 方案三（阿里 Canal + RocketMQ '
           '异步解耦）：业务代码只管更新 MySQL ，通过 Canal 伪装成 MySQL 从库订阅 Binlog 日志投递至 MQ ，由消费者异步删除 / 更新 Redis '
           '，失败则利用 MQ 重试队列保证最终一致。 模块五： Spring 框架、消息队列（ MQ ）与计算机网络 Q8. Spring Bean '
           '的生命周期与三级缓存如何解决循环依赖？ Bean 生命周期主干：实例化（createBeanInstance 反射构造） → 属性注入（populateBean） → '
           'Aware 接口回调（BeanNameAware / ApplicationContextAware） → BeanPostProcessor 前置处理 → '
           '初始化（InitializingBean.afterPropertiesSet 及自定义 init-method） → BeanPostProcessor 后置处理（AOP '
           '动态代理在此步生成） → 销毁（DisposableBean）。 三级缓存机制：一级缓存 singletonObjects（成品单实例）、二级缓存 '
           'earlySingletonObjects（早期半成品实例 / 代理对象）、三级缓存 singletonFactories（存放 ObjectFactory 工厂 '
           'Lambda ）。当 A 与 B 循环依赖时， A 实例化后尚未属性填充前，先将生成早期 引用的工厂放入三级缓存；若 A 需要被 AOP '
           '代理，三级缓存工厂会提前触发生成代理对象并晋升至二 级缓存，确保 B 注入的是 A 的代理对象而非原始对象。注：构造器注入与多例（prototype）循环依 '
           '赖无法通过三级缓存解决。 Q9. 消息队列（ Kafka / RocketMQ ）如何保证消息不丢失、不重复消费（',
  'tags': ['八股文', 'Redis', '模块四： Redis'],
  'assessment_points': '考察 Redis 高并发架构与一致性工程方案。'},
 {'id': 'BAGU-SYS-01',
  'lang': 'zh-CN',
  'title': '如何设计一个百万 QPS 秒杀系统？',
  'category': '案例分析',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '模块六：高并发系统设计 —— 如何设计一个百万 QPS 秒杀系统？ 大厂二面 / 三面必考架构开放题，核心思想是“ 层层漏斗拦截、读多写少极致缓存、热点隔离、异步削 '
           '峰、兜底限流 ”： 1. 前端与接入层拦截（拦截 80% 流量）：商品详情页静态化推至 CDN 边缘节点；点击秒杀按钮置灰防连 点 + 滑块验证码拉长请求时间窗； '
           'Nginx / API 网关层按 UID 与 IP 实施令牌桶限流。 2. 应用层与 Redis 预扣库存（拦截 19% 流量）：秒杀开始前将商品库存预热到 Redis '
           '。扣减库存严禁 “ 先 查再减 ” ，必须使用 Redis Lua 脚本原子执行“校验用户是否已购买（ Set 去重） + 校验库存是否 > 0 + 扣减库存 ” '
           '。若单品热度极高（千万级并发打单分片），采用库存分片技术（如将 1000 件库存拆分为 10 个子 Key stock_sku_01 ~ 10 分散在 Redis '
           'Cluster 不同节点，客户端随机路由扣减）。 3. MQ 异步削峰与数据库最终落库（仅 1% 有效下单流量入库）：Lua 预扣成功后立即生成临时流水号返 '
           '回前端排队中，同时发送事务消息至 RocketMQ ；下游订单服务按数据库承受能力匀速拉取消费，写入 MySQL 并扣减真实库存（带上 WHERE stock > 0 '
           '乐观锁防止超卖）。超时未支付订单通过 RocketMQ 定时 / 延迟消息自动关单并回滚 Redis 与 MySQL 库存。',
  'tags': ['八股文', '系统设计', '高并发'],
  'assessment_points': '考察分层漏斗、缓存、异步削峰与兜底限流等架构能力。'},
 {'id': 'AI-001',
  'lang': 'zh-CN',
  'title': 'Workflow 、 Agent 与 Tools 三者的核心区别是什么？ Agent 基本架构包含哪些核心组件？',
  'category': '专业知识',
  'difficulty': '简单',
  'type': 'professional',
  'ideal': '概念边界：Tools （工具）是具备确定性输入输出的外部能力封装（ API 、数据库查询、代码沙箱）； Workflow '
           '（工作流）是由开发者预先硬编码编排好分支与节点的固定流水线（控制权在代码）；Agent （智能体）是以 LLM '
           '为核心大脑，根据环境反馈自主动态规划路径、决定调用何种工具、决定何时终止 循环的闭环系统（控制权在模型）。 四大核心组件（ Weng 经典架构）：① Planning '
           '（规划与推理）：子目标拆解、思维链推理与自我反思 修正；② Memory （记忆系统）：短期工作记忆与长期外部存储；③ Tools （工具使用）：感知与改变 外部世界；④ '
           'Action / Execution Loop （执行主循环）：接收 Observation 并推进下一轮迭代。',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-002',
  'lang': 'zh-CN',
  'title': 'ReAct 、 Plan-and-Execute 、 Reflection 三种 Agent 推理范式有什么核心区别？',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '推理范式 核心执行流程 优势与适用场景 局限性与工程优化 ReAct (Reason + Act) 按 Thought → Action → Observation '
           '循环单步推进，每步 根据工具返回的观测结果决定下一 步动作。 灵活度最高，适应强动 态环境（如网页浏览、 故障排查、 Code Agent ）。 每步均需调用大模型， '
           '长链路下 Token 消耗 大、易陷入局部死循 环。 Plan-and- Execute 先由 Planner 模型一次性生成多步 全局计划 DAG/ 列表，再交由轻量 '
           'Executor 逐项执行，必要时 Re- plan 。 全局视野好，子任务可 用小模型并发执行，显 著降低端到端延迟与成 本。 初始计划若偏离实际， 后续步骤易连环失效， '
           '必须引入动态重规划机 制。 Reflection (Reflexion) 遵循 Generator → Evaluator/Critic → '
           'Revise，对生成结果或报错日志进 行自我批判与多轮修正。 显著提升代码生成（通 过单元测试反馈修 正）、复杂数学推理与 长文写作质量。 耗时长，需设定最大迭 '
           '代轮数（通常 2~3 轮） 及明确的外部验证信 号。 AI 大模型与前沿方向高频面试题库（ AIGC-Interview-Book / 小林 coding ） Page 1 '
           'of 6',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-003',
  'lang': 'zh-CN',
  'title': '介绍一下 AI Agent 的记忆机制？长短期记忆系统在实际开发中如何设计？上下文过长怎么压',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '缩？ 短期记忆（ Short-term / Working Memory ）：即当前会话窗口内的上下文消息历史（ Context Window '
           '），维护当前任务状态、近期对话轮次与工具调用中间结果。 长期记忆（ Long-term Memory ）：跨会话持久化存储，细分为三类：① 情景记忆（ Episodic '
           'Memory ）：用户过往关键交互事件与成功案例（ Few-shot 经验库）；② 语义记忆（ Semantic Memory '
           '）：用户画像偏好、业务事实与领域知识（存于向量库或知识图谱）；③ 程序记忆 （ Procedural Memory ）：系统 Prompt 规范、 SOP 技能库。 '
           '上下文管理与 Compact 自动压缩机制（ Claude Code 等前沿架构高频考点）：当多轮工具调用导致 Token 逼近上下文阈值（如 80% 窗口上限）时，触发 '
           'Compact 压缩：① 截断或外部化超长工具输出 （如只保留报错栈首尾行，完整日志写入临时文件按需读取）；② 异步调用摘要模型将早期多轮历史坍 缩为结构化 '
           '<summary>（保留目标、已完成修改、待办事项与关键约束），拼接最近 N 轮完整对话继 续执行。',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-004',
  'lang': 'zh-CN',
  'title': '什么是 Harness Engineering 与 Loop Engineering ？开放题：如何设计一个高可靠的企业级',
  'category': '案例分析',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '客服 /Coding Agent ？ Loop Engineering 与 Harness Engineering ：AI 工程正从单纯写 Prompt 转向设计主循环（ '
           'Loop ）与 外围驾驭系统（ Harness ）。Loop Engineering 关注 while(has_tool_call) 异步主循环、流式事 '
           '件分发与中断恢复；Harness Engineering 则是围绕模型构建的确定性工程护栏 —— 包括环境上下文注 入（CLAUDE.md / 规则文件）、 Linter/ '
           '单测自动校验反馈闭环、沙箱权限管控与错误自愈，让 Agent 不 再重复犯错。 客服 Agent 开放设计标准作答框架：① 意图路由与任务拆解：前置轻量意图分类器 + '
           '槽位提取，简单 FAQ 走快速检索通道，复杂售后（查单、退换货、改地址）进入 ReAct 子 Agent ；② 工具调用失败兜 底：参数校验错误将 Schema '
           '报错喂回模型自修（限重试 2 次）；下游 API 超时触发指数退避重试 + 降级话术；遇到高风险操作（大额退款）或连续 2 轮未解决，立即携带会话摘要平滑转接人工坐席。 '
           '二、 RAG 检索增强生成与进阶路线（小林 coding RAG 20 题精粹）',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察案例分析相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-005',
  'lang': 'zh-CN',
  'title': '相比直接微调（ SFT ）大模型， RAG 主要解决什么问题？二者如何选型？',
  'category': '专业知识',
  'difficulty': '简单',
  'type': 'professional',
  'ideal': '核心定位对比：RAG 外挂知识库主要解决事实性幻觉、私有 / 实时数据动态更新、答案可溯源 （ Citation ）以及权限隔离问题，成本低且无需重训模型；SFT '
           '微调主要解决特定输出格式规范、垂直 领域行话风格、复杂指令遵循与推理模式内化问题（微调不擅长灌输高频变动的事实知识）。生产级系 统通常采用“RAG + 领域微调（ RAFT '
           '） ”协同方案。',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-006',
  'lang': 'zh-CN',
  'title': 'RAG 全流程中如何规避文档切分（ Chunking ）把完整语义切断的问题？检索准确率低如何系',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '统性优化？ 规避语义切割的五种工程手段：① 递归字符切分 + 重叠窗口（ Overlap ）：按段落、换行、句号层级切 分，相邻块保留 10%~20% 的 Token '
           '重叠；② 结构感知切分：按 Markdown 标题层级或 HTML 表格完 整边界切分（表格严禁从中间截断，需附带表头）；③ 父子文档检索（ Parent-Child / '
           'Small-to- Big ）：用细粒度小句子块生成 Embedding 保证检索高召回，命中后将对应的完整父段落 / 整章送入大模 型上下文；④ 语义分块（ '
           'Semantic Chunking ）：计算相邻句子 Embedding 余弦相似度，在语义突变 处切分；⑤ 上下文增强分块（ Contextual Retrieval '
           '）：切块入库前先让轻量模型为每个 Chunk 生成一 段所属文档背景前缀（如 “ 本段出自 XX 公司 2026 财报第三章 ” ），再做向量化。 AI '
           '大模型与前沿方向高频面试题库（ AIGC-Interview-Book / 小林 coding ） Page 2 of 6 生产级 RAG 检索优化全链路：① 查询改写（ '
           'Query Rewriting ）：多轮指代消解、 Multi-Query 多视角 扩写、 HyDE （先生成假设性答案再检索）与 Step-back 抽象提问；② '
           '混合检索（ Hybrid Search ）： BM25 稀疏检索（精准匹配专有名词、型号、错误码） + 稠密向量检索（语义泛化），通过 RRF （倒数 '
           '排序融合）合并结果；③ 重排序（ Rerank ）：初检召回 Top-50 后，使用 Cross-Encoder 架构的 Reranker （如 BGE-Reranker '
           '）精细打分截取 Top-5 。',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-007',
  'lang': 'zh-CN',
  'title': '传统 RAG 撞墙后， GraphRAG 与 LightRAG 的核心原理是什么？为什么字节 /Claude Code',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '在代码检索中偏向用 grep 而非传统 RAG ？ GraphRAG vs LightRAG ：传统向量 RAG 无法回答跨越多篇文档的全局总结与多跳关系推理题（如 '
           '“总结全库文档的核心主题脉络 ” ）。微软 GraphRAG 先用 LLM 抽取出实体与关系构建知识图谱，再通 过 Leiden '
           '社区发现算法聚类并预生成多层级社区摘要，但建库与更新 Token 成本极高；LightRAG 引 '
           '入双层检索机制（低层检索具体实体，高层检索抽象主题关键词），结合图结构一跳邻居与向量检索， 支持增量更新且大幅降低检索延迟与成本。 为什么代码检索常用 grep / '
           'ripgrep + AST 而非向量 RAG ？（字节高频面试题）：① 代码具有极 强的精确符号依赖（函数名、变量名、调用链）， Embedding '
           '会抹平标识符的精确字面特征；② 代码 库随用户编辑每分钟都在变动，向量索引频繁重建存在滞后与同步开销；③ 通过 Agent 自主组合 glob '
           '（按文件名）、ripgrep（正则毫秒级精准搜索）与语法树按需读取文件，零索引成本且准确率更高。 三、 LLM 工具调用与 MCP 协议（小林 coding 工具调用 16 '
           '题精粹）',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-008',
  'lang': 'zh-CN',
  'title': '大模型的 Function Calling 能力是怎么训练出来的？什么是 MCP （模型上下文协议）？',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': 'Function Calling 原理与训练：模型本身并不直接执行函数，而是根据系统提示词中注入的工具 JSON Schema 定义，输出结构化的调用指令（函数名 + '
           'JSON 参数），由宿主程序拦截执行后将返回值作为 role: tool 消息塞回模型生成最终回复。训练过程包括：① 合成多样化工具调用 SFT 数据（单工 '
           '具、多工具并行、多步嵌套以及无合适工具时拒答 / 追问参数的负样本），引入专用特殊 Token （如 <|tool_call|>）；② 强化学习后训练（ RL '
           '）：利用沙箱环境执行校验（ AST 语法匹配度、参数准 确率、多步任务完成率）给予奖励信号；③ 推理阶段配合受限解码（ Constrained Decoding / FSM '
           '有 限状态机）强制输出合法 JSON 。 MCP （ Model Context Protocol ）架构：由 Anthropic 提出的标准化开源协议，解决 N '
           '个大模型应用对 接 M 个数据源的碎片化问题（类似 AI 界的 USB-C 接口）。采用三层架构：MCP Host（宿主应用，如 IDE 、桌面客户端）、MCP '
           'Client（宿主内维护与 Server 1:1 连接的协议客户端）、MCP Server（轻 量服务，向模型暴露三大核心原语：Resources 数据资源、 Tools '
           '可执行工具、 Prompts 提示词模 板），支持本地 stdio 与远程 Streamable HTTP / SSE 通信。 AI 大模型与前沿方向高频面试题库（ '
           'AIGC-Interview-Book / 小林 coding ） Page 3 of 6 四、 Transformer 底层原理、架构演进与手撕代码（ '
           'AIGC-Interview-Book & 小林工程 22 题）',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-009',
  'lang': 'zh-CN',
  'title': '为什么 Self-Attention 公式要除以 √dk？ MHA 、 MQA 、 GQA 与 DeepSeek MLA 的演进原理',
  'category': '专业知识',
  'difficulty': '中等',
  'type': 'professional',
  'ideal': '是什么？ 缩放点积注意力公式：Attention(Q, K, V) = softmax(Q KT / √dk) V。假设 Q 和 K 的分量是独立同分布、均 值为 0 '
           '、方差为 1 的随机变量，则内积 q · k 的均值为 0 ，方差为 dk。当维度 dk 较大（如 64 或 128 ） 时，内积数值方差过大，会将 softmax '
           '推入指数饱和区，导致梯度趋近于 0 （梯度消失）；除以 √dk 可将方差重新拉回 1 。 注意力机制演进（核心解决推理阶段 KV Cache 显存瓶颈）： MHA '
           '（多头注意力）：h 个查询头拥有各自独立的 K, V 头， KV Cache 显存占用最大。 MQA （多查询注意力）：所有 h 个 Q 头共享同一组 K, V 头， KV '
           'Cache 降至 1/h，但模型表达能力 受损明显。 GQA （分组查询注意力， LLaMA-3 / Qwen2.5 采用）：将 h 个 Q 头分为 g 组，每组共享一套 '
           'K, V，完美平衡精度与 KV Cache 压缩。 MLA （多头潜在注意力， DeepSeek-V2 / V3 核心创新）：通过低秩联合压缩矩阵将 K, V 投影到极 '
           '低维的潜在向量 ctKV 进行缓存，并将投影矩阵吸收到 WQ 和 WO 中；同时采用解耦 RoPE （ Decoupled RoPE '
           '）单独拼一小段携带旋转位置编码的键向量，使得 KV Cache 压缩率超越 GQA 且模型性能优于标准 MHA 。 AI 大模型与前沿方向高频面试题库（ '
           'AIGC-Interview-Book / 小林 coding ） Page 4 of 6',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-010',
  'lang': 'zh-CN',
  'title': '大厂算法岗必考手撕：用 PyTorch 完整写出带 Causal Mask 的多头自注意力（ MHA ）',
  'category': '编程题',
  'difficulty': '困难',
  'type': 'coding',
  'ideal': 'import math import torch import torch.nn as nn import torch.nn.functional as F class '
           'CausalMultiHeadAttention(nn.Module): def __init__(self, d_model: int, num_heads: int, '
           'dropout: float = 0.1): super().__init__() assert d_model % num_heads == 0, "d_model '
           'must be divisible by num_heads" self.d_model = d_model self.num_heads = num_heads '
           'self.head_dim = d_model // num_heads self.q_proj = nn.Linear(d_model, d_model) '
           'self.k_proj = nn.Linear(d_model, d_model) self.v_proj = nn.Linear(d_model, d_model) '
           'self.out_proj = nn.Linear(d_model, d_model) self.dropout = nn.Dropout(dropout) def '
           'forward(self, x: torch.Tensor, pad_mask: torch.Tensor = None) -> torch.Tensor: B, T, C '
           '= x.shape # Batch, SeqLen, d_model q = self.q_proj(x).view(B, T, self.num_heads, '
           'self.head_dim).transpose(1, 2) k = self.k_proj(x).view(B, T, self.num_heads, '
           'self.head_dim).transpose(1, 2) v = self.v_proj(x).view(B, T, self.num_heads, '
           'self.head_dim).transpose(1, 2) # 计算缩放点积分数 : (B, num_heads, T, T) scores = '
           'torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.head_dim) # 构造下三角因果掩码 (Causal '
           'Mask) ，防止偷看未来 Token causal_mask = torch.tril(torch.ones(T, T, device=x.device, '
           "dtype=torch.bool)) scores = scores.masked_fill(~causal_mask, float('-inf')) if "
           "pad_mask is not None: scores = scores.masked_fill(pad_mask == 0, float('-inf')) "
           'attn_weights = F.softmax(scores, dim=-1) attn_weights = self.dropout(attn_weights) out '
           '= torch.matmul(attn_weights, v) # (B, num_heads, T, head_dim) out = out.transpose(1, '
           '2).contiguous().view(B, T, C) return self.out_proj(out) AI 大模型与前沿方向高频面试题库（ '
           'AIGC-Interview-Book / 小林 coding ） Page 5 of 6',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察编程题相关原理、工程实践与表达结构（PDF 原题）。',
  'coding_language': 'python',
  'entry_point': 'CausalMultiHeadAttention',
  'problem_statement': '大厂算法岗必考手撕：用 PyTorch 完整写出带 Causal Mask 的多头自注意力（ MHA ）',
  'signature': 'import math\n'
               'import torch\n'
               'import torch.nn as nn\n'
               'import torch.nn.functional as F\n'
               'class CausalMultiHeadAttention(nn.Module):\n'
               '    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):\n'
               '        super().__init__()\n'
               '        assert d_model % num_heads == 0, "d_model must be divisible by num_heads"\n'
               '        self.d_model = d_model\n'
               '        self.num_heads = num_heads\n'
               '        self.head_dim = d_model // num_heads\n'
               '        self.q_proj = nn.Linear(d_model, d_model)\n'
               '        self.k_proj = nn.Linear(d_model, d_model)\n'
               '        self.v_proj = nn.Linear(d_model, d_model)\n'
               '        self.out_proj = nn.Linear(d_model, d_model)\n'
               '        self.dropout = nn.Dropout(dropout)\n'
               '    def forward(self, x: torch.Tensor, pad_mask: torch.Tensor = None) -> \n'
               'torch.Tensor:\n'
               '        B, T, C = x.shape  # Batch, SeqLen, d_model\n'
               '        q = self.q_proj(x).view(B, T, self.num_heads, '
               'self.head_dim).transpose(1, \n'
               '2)\n'
               '        k = self.k_proj(x).view(B, T, self.num_heads, '
               'self.head_dim).transpose(1, \n'
               '2)\n'
               '        v = self.v_proj(x).view(B, T, self.num_heads, '
               'self.head_dim).transpose(1, \n'
               '2)\n'
               '        # 计算缩放点积分数 : (B, num_heads, T, T)\n'
               '        scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.head_dim)\n'
               '        # 构造下三角因',
  'starter_code': 'import math\n'
                  'import torch\n'
                  'import torch.nn as nn\n'
                  'import torch.nn.functional as F\n'
                  'class CausalMultiHeadAttention(nn.Module):\n'
                  '    def __init__(self, d_model: int, num_heads: int, dropout: float = 0.1):\n'
                  '        super().__init__()\n'
                  '        assert d_model % num_heads == 0, "d_model must be divisible by '
                  'num_heads"\n'
                  '        self.d_model = d_model\n'
                  '        self.num_heads = num_heads\n'
                  '        self.head_dim = d_model // num_heads\n'
                  '        self.q_proj = nn.Linear(d_model, d_model)\n'
                  '        self.k_proj = nn.Linear(d_model, d_model)\n'
                  '        self.v_proj = nn.Linear(d_model, d_model)\n'
                  '        self.out_proj = nn.Linear(d_model, d_model)\n'
                  '        self.dropout = nn.Dropout(dropout)\n'
                  '    def forward(self, x: torch.Tensor, pad_mask: torch.Tensor = None) -> \n'
                  'torch.Tensor:\n'
                  '        B, T, C = x.shape  # Batch, SeqLen, d_model\n'
                  '        q = self.q_proj(x).view(B, T, self.num_heads, '
                  'self.head_dim).transpose(1, \n'
                  '2)\n'
                  '        k = self.k_proj(x).view(B, T, self.num_heads, '
                  'self.head_dim).transpose(1, \n'
                  '2)\n'
                  '        v = self.v_proj(x).view(B, T, self.num_heads, '
                  'self.head_dim).transpose(1, \n'
                  '2)\n'
                  '        # 计算缩放点积分数 : (B, num_heads, T, T)\n'
                  '        scores = torch.matmul(q, k.transpose(-2, -1)) / '
                  'math.sqrt(self.head_dim)\n'
                  '        # 构造下三角因果掩码  (Causal Mask) ，防止偷看未来  Token\n'
                  '        causal_mask = torch.tril(torch.ones(T, T, device=x.device, \n'
                  'dtype=torch.bool))\n'
                  "        scores = scores.masked_fill(~causal_mask, float('-inf'))\n"
                  '        if pad_mask is not None:\n'
                  "            scores = scores.masked_fill(pad_mask == 0, float('-inf'))\n"
                  '        attn_weights = F.softmax(scores, dim=-1)\n'
                  '        attn_weights = self.dropout(attn_weights)\n'
                  '        out = torch.matmul(attn_weights, v)  # (B, num_heads, T, head_dim)\n'
                  '        out = out.transpose(1, 2).contiguous().view(B, T, C)\n'
                  '        return self.out_proj(out)',
  'samples': [],
  'hidden_tests': [],
  'answer_structure': '口述 MHA 原理 → 手写模块 → 说明 Causal Mask 与复杂度。'},
 {'id': 'AI-011',
  'lang': 'zh-CN',
  'title': '主流开源大模型（ LLaMA / Qwen / DeepSeek ）相比原始 Transformer 做了哪些结构改进？',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '1. Pre-Norm + RMSNorm ：将归一化从残差之后（ Post-Norm ）移至子层输入端（ Pre-Norm ），显著 提升深层训练稳定性；用 '
           'RMSNorm 替代 LayerNorm ，省去均值中心化计算与偏置项 β，计算速度提升 约 10%~30% 且效果相当。 2. RoPE （旋转位置编码）：在复数空间对 '
           'Q, K 施加绝对位置旋转变换 Rm，使得内积 (Rm q)T (Rn k) 仅 依赖于相对距离 m − n（以绝对位置形式实现相对位置编码），配合 NTK-Aware 或 '
           'YaRN 插值具备极佳 的长文本外推能力。 3. SwiGLU 激活函数：FFN 层引入门控线性单元与 Swish 激活结合，包含三个线性投影矩阵，为保持 '
           '总参数量不变通常将中间层维度从 4d 调整为 (8/3)d。 五、后训练对齐（ SFT / RLHF / DPO / GRPO ）与高性能推理部署 高频考察专题 '
           '核心公式原理、对比与工程落地标准答法 LoRA 与 QLoRA 微调 原理 LoRA ：冻结预训练权重 W0 ∈ Rd×k，在旁路注入低秩分解矩阵 ΔW = B · '
           'A（其中 A ∈ Rr×k, B ∈ Rd×r, r ≪ min(d, k)）。为什么初始化时 A 用高斯分布而 B 全置为 0 ？保证训 练第 0 步时 ΔW = '
           '0，模型输出与原预训练模型完全一致，避免破坏已有表征（若 A 、 B 全为 0 则梯度为 0 无法更新）。QLoRA ：基座模型采用 4-bit NormalFloat '
           '(NF4) 量化 + 双重量化 + 分页优化器，大幅降低微调显存门槛。 PPO vs DPO vs GRPO 强化学习对齐 演进（ DeepSeek 必 考） 1. PPO '
           '（传统 RLHF ）：在线强化学习，需同时在显存中维护 4 个模型（ Actor 策略模 型、 Reference 参考模型、 Reward 奖励模型、 Critic '
           '价值模型），显存开销极大且训练 超参极敏感。 2. DPO （直接偏好优化）：利用 Bradley-Terry 偏好模型与最优策略解析解，将奖励函 '
           '数隐式表示为策略模型与参考模型的对数概率比，省去独立 Reward 和 Critic 模型，直 接在正负偏好对 (x, yw, yl) '
           '上做离线分类损失优化，但易出现正负样本概率同时下降或 长文本偏置。 3. GRPO （ Group Relative Policy Optimization ， '
           'DeepSeekMath / R1 核心）：彻底 砍掉与 Actor 同等大小的 Critic 价值模型（节省近一半显存），针对同一问题 q 采样 一组输出 {o1, '
           'o2, ..., oG}，利用规则验证器或奖励模型打分 {r1, ..., rG}，通过组内相对均 值与标准差归一化计算优势函数 Ai = (ri − mean(r)) / '
           'std(r)，极大推动了长思维链 （ CoT ）推理大模型的强化学习训练。 KV Cache 显存计算与 FlashAttention / PagedAttention '
           'KV Cache 显存公式（ FP16 ）：单次请求缓存大小 = 2 × nlayers × nkv_heads × dhead × seq_len × '
           'batch_size × 2 Bytes。 FlashAttention ：硬件感知的精确注意力算法（无近似损失），利用 GPU SRAM 共享 内存分块（ Tiling '
           '） + Online Softmax + 反向传播重计算，避免将庞大的 N × N 注意力 矩阵反复读写至慢速 HBM 显存，将显存复杂度从 O(N2) 降至 O(N)。 '
           'PagedAttention （ vLLM 核心）：借鉴操作系统虚拟内存分页机制，将连续的逻辑 KV Cache 切分为固定大小的物理块（ Block '
           '），通过块表映射按需动态分配非连续显存， 彻底消除显存内部 / 外部碎片，并支持多请求共享公共 Prompt 前缀（ Prefix Caching ）。 主流推理框架选型与 '
           '解码采样参数 推理引擎选型：高并发在线服务首选 vLLM（ PagedAttention + Continuous Batching 连 续批处理，生态最完善）或 '
           'SGLang（ RadixAttention 自动前缀树缓存 + 高速结构化 JSON 约束解码，极适合多轮 Agent 场景）；极致硬件压榨选 '
           'TensorRT-LLM；端 侧 /CPU 本地部署选 llama.cpp。 解码参数：Temperature（温度，缩放 Logits 分布：趋近 0 '
           '接近贪心确定性输出，适 合代码 / 数学；调高增加多样性）、Top-K（仅保留概率最高的 K 个候选词）、Top-P / Nucleus '
           'Sampling（按概率从高到低累加直至达到阈值 P 的动态候选集）。 AI 大模型与前沿方向高频面试题库（ AIGC-Interview-Book / 小林 coding '
           '） Page 6 of 6',
  'tags': ['AI大模型', 'AIGC', 'AI大模型'],
  'assessment_points': '考察专业知识相关原理、工程实践与表达结构（PDF 原题）。'},
 {'id': 'AI-POST-01',
  'lang': 'zh-CN',
  'title': 'LoRA 与 QLoRA 微调原理',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': 'LoRA 与 QLoRA 微调 原理 LoRA ：冻结预训练权重 W0 ∈ Rd×k，在旁路注入低秩分解矩阵 ΔW = B · A（其中 A ∈ Rr×k, B ∈ '
           'Rd×r, r ≪ min(d, k)）。为什么初始化时 A 用高斯分布而 B 全置为 0 ？保证训 练第 0 步时 ΔW = '
           '0，模型输出与原预训练模型完全一致，避免破坏已有表征（若 A 、 B 全为 0 则梯度为 0 无法更新）。QLoRA ：基座模型采用 4-bit NormalFloat '
           '(NF4) 量化 + 双重量化 + 分页优化器，大幅降低微调显存门槛。 PPO vs DPO vs GRPO 强化学习对齐 演进（ DeepSeek 必 考） 1. PPO '
           '（传统 RLHF ）：在线强化学习，需同时在显存中维护 4 个模型（ Actor 策略模 型、 Reference 参考模型、 Reward 奖励模型、 Critic '
           '价值模型），显存开销极大且训练 超参极敏感。 2. DPO （直接偏好优化）：利用 Bradley-Terry 偏好模型与最优策略解析解，将奖励函 '
           '数隐式表示为策略模型与参考模型的对数概率比，省去独立 Reward 和 Critic 模型，直 接在正负偏好对 (x, yw, yl) '
           '上做离线分类损失优化，但易出现正负样本概率同时下降或 长文本偏置。 3. GRPO （ Group Relative Policy Optimization ， '
           'DeepSeekMath / R1 核心）：彻底 砍掉与 Actor 同等大小的 Critic 价值模型（节省近一半显存），针对同一问题 q 采样 一组输出 {o1, '
           'o2, ..., oG}，利用规则验证器或奖励模型打分 {r1, ..., rG}，通过组内相对均 值与标准差归一化计算优势函数 Ai = (ri − mean(r)) / '
           'std(r)，极大推动了长思维链 （ CoT ）推理大模型的强化学习训练。 KV Cache 显存计算与 FlashAttention / PagedAttention '
           'KV Cache 显存公式（ FP16 ）：单次请求缓存大小 = 2 × nlayers × nkv_heads × dhead × seq_len × '
           'batch_size × 2 Bytes。 FlashAttention ：硬件感知的精确注意力算法（无近似损失），利用 GPU SRAM 共享 内存分块（ Tiling '
           '） + Online Softmax + 反向传播重计算，避免将庞大的 N × N 注意力 矩阵反复读写至慢速 HBM 显存，将显存复杂度从 O(N2) 降至 O(N)。 '
           'PagedAttention （ vLLM 核心）：借鉴操作系统虚拟内存分页机制，将连续的逻辑 KV Cache 切分为固定大小的物理块（ Block '
           '），通过块表映射按需动态分配非连续显存， 彻底消除显存内部 / 外部碎片，并支持多请求共享公共 Prompt 前缀（ Prefix Caching ）。 主流推理框架选型与 '
           '解码采样参数 推理引擎选型：高并发在线服务首选 vLLM（ PagedAttention + Continuous Batching 连 续批处理，生态最完善）或 '
           'SGLang（ RadixAttention 自动前缀树缓存 + 高速结构化 JSON 约束解码，极适合多轮 Agent 场景）；极致硬件压榨选 '
           'TensorRT-LLM；端 侧 /CPU 本地部署选 llama.cpp。 解码参数：Temperature（温度，缩放 Logits 分布：趋近 0 '
           '接近贪心确定性输出，适 合代码 / 数学；调高增加多样性）、Top-K（仅保留概率最高的 K 个候选词）、Top-P / Nucleus '
           'Sampling（按概率从高到低累加直至达到阈值 P 的动态候选集）。 AI 大模型与前沿方向高频面试题库（ AIGC-Interview-Book / 小林 coding '
           '） Page 6 of 6',
  'tags': ['AI大模型', '后训练', '推理'],
  'assessment_points': '考察大模型训练对齐与推理部署的工程理解。'},
 {'id': 'AI-POST-02',
  'lang': 'zh-CN',
  'title': 'PPO vs DPO vs GRPO 强化学习对齐演进',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': 'PPO vs DPO vs GRPO 强化学习对齐 演进（ DeepSeek 必 考） 1. PPO （传统 RLHF ）：在线强化学习，需同时在显存中维护 4 个模型（ '
           'Actor 策略模 型、 Reference 参考模型、 Reward 奖励模型、 Critic 价值模型），显存开销极大且训练 超参极敏感。 2. DPO '
           '（直接偏好优化）：利用 Bradley-Terry 偏好模型与最优策略解析解，将奖励函 数隐式表示为策略模型与参考模型的对数概率比，省去独立 Reward 和 Critic '
           '模型，直 接在正负偏好对 (x, yw, yl) 上做离线分类损失优化，但易出现正负样本概率同时下降或 长文本偏置。 3. GRPO （ Group Relative '
           'Policy Optimization ， DeepSeekMath / R1 核心）：彻底 砍掉与 Actor 同等大小的 Critic '
           '价值模型（节省近一半显存），针对同一问题 q 采样 一组输出 {o1, o2, ..., oG}，利用规则验证器或奖励模型打分 {r1, ..., rG}，通过组内相对均 '
           '值与标准差归一化计算优势函数 Ai = (ri − mean(r)) / std(r)，极大推动了长思维链 （ CoT ）推理大模型的强化学习训练。 KV Cache '
           '显存计算与 FlashAttention / PagedAttention KV Cache 显存公式（ FP16 ）：单次请求缓存大小 = 2 × nlayers × '
           'nkv_heads × dhead × seq_len × batch_size × 2 Bytes。 FlashAttention '
           '：硬件感知的精确注意力算法（无近似损失），利用 GPU SRAM 共享 内存分块（ Tiling ） + Online Softmax + 反向传播重计算，避免将庞大的 N '
           '× N 注意力 矩阵反复读写至慢速 HBM 显存，将显存复杂度从 O(N2) 降至 O(N)。 PagedAttention （ vLLM '
           '核心）：借鉴操作系统虚拟内存分页机制，将连续的逻辑 KV Cache 切分为固定大小的物理块（ Block ），通过块表映射按需动态分配非连续显存， 彻底消除显存内部 / '
           '外部碎片，并支持多请求共享公共 Prompt 前缀（ Prefix Caching ）。 主流推理框架选型与 解码采样参数 推理引擎选型：高并发在线服务首选 vLLM（ '
           'PagedAttention + Continuous Batching 连 续批处理，生态最完善）或 SGLang（ RadixAttention 自动前缀树缓存 + '
           '高速结构化 JSON 约束解码，极适合多轮 Agent 场景）；极致硬件压榨选 TensorRT-LLM；端 侧 /CPU 本地部署选 llama.cpp。 '
           '解码参数：Temperature（温度，缩放 Logits 分布：趋近 0 接近贪心确定性输出，适 合代码 / 数学；调高增加多样性）、Top-K（仅保留概率最高的 K '
           '个候选词）、Top-P / Nucleus Sampling（按概率从高到低累加直至达到阈值 P 的动态候选集）。 AI 大模型与前沿方向高频面试题库（ '
           'AIGC-Interview-Book / 小林 coding ） Page 6 of 6',
  'tags': ['AI大模型', '后训练', '推理'],
  'assessment_points': '考察大模型训练对齐与推理部署的工程理解。'},
 {'id': 'AI-POST-03',
  'lang': 'zh-CN',
  'title': 'KV Cache 显存计算与 FlashAttention / PagedAttention',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': 'KV Cache 显存瓶颈）： MHA （多头注意力）：h 个查询头拥有各自独立的 K, V 头， KV Cache 显存占用最大。 MQA （多查询注意力）：所有 h 个 '
           'Q 头共享同一组 K, V 头， KV Cache 降至 1/h，但模型表达能力 受损明显。 GQA （分组查询注意力， LLaMA-3 / Qwen2.5 采用）：将 h '
           '个 Q 头分为 g 组，每组共享一套 K, V，完美平衡精度与 KV Cache 压缩。 MLA （多头潜在注意力， DeepSeek-V2 / V3 '
           '核心创新）：通过低秩联合压缩矩阵将 K, V 投影到极 低维的潜在向量 ctKV 进行缓存，并将投影矩阵吸收到 WQ 和 WO 中；同时采用解耦 RoPE （ '
           'Decoupled RoPE ）单独拼一小段携带旋转位置编码的键向量，使得 KV Cache 压缩率超越 GQA 且模型性能优于标准 MHA 。 AI '
           '大模型与前沿方向高频面试题库（ AIGC-Interview-Book / 小林 coding ） Page 4 of 6 Q10. 大厂算法岗必考手撕：用 PyTorch '
           '完整写出带 Causal Mask 的多头自注意力（ MHA ） import math import torch import torch.nn as nn import '
           'torch.nn.functional as F class CausalMultiHeadAttention(nn.Module): def __init__(self, '
           'd_model: int, num_heads: int, dropout: float = 0.1): super().__init__() assert d_model '
           '% num_heads == 0, "d_model must be divisible by num_heads" self.d_model = d_model '
           'self.num_heads = num_heads self.head_dim = d_model // num_heads self.q_proj = '
           'nn.Linear(d_model, d_model) self.k_proj = nn.Linear(d_model, d_model) self.v_proj = '
           'nn.Linear(d_model, d_model) self.out_proj = nn.Linear(d_model, d_model) self.dropout = '
           'nn.Dropout(dropout) def forward(self, x: torch.Tensor, pad_mask: torch.Tensor = None) '
           '-> torch.Tensor: B, T, C = x.shape # Batch, SeqLen, d_model q = self.q_proj(x).view(B, '
           'T, self.num_heads, self.head_dim).transpose(1, 2) k = self.k_proj(x).view(B, T, '
           'self.num_heads, self.head_dim).transpose(1, 2) v = self.v_proj(x).view(B, T, '
           'self.num_heads, self.head_dim).transpose(1, 2) # 计算缩放点积分数 : (B, num_heads, T, T) '
           'scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.head_dim) # 构造下三角因果掩码 '
           '(Causal Mask) ，防止偷看未来 Token causal_mask = torch.tril(torch.ones(T, T, device=x.device, '
           "dtype=torch.bool)) scores = scores.masked_fill(~causal_mask, float('-inf')) if "
           "pad_mask is not None: scores = scores.masked_fill(pad_mask == 0, float('-inf')) "
           'attn_weights = F.softmax(scores, dim=-1) attn_weights = self.dropout(attn_weights) out '
           '= torch.matmul(attn_weights, v) # (B, num_heads, T, h',
  'tags': ['AI大模型', '后训练', '推理'],
  'assessment_points': '考察大模型训练对齐与推理部署的工程理解。'},
 {'id': 'AI-POST-04',
  'lang': 'zh-CN',
  'title': '主流推理框架选型与解码采样参数',
  'category': '专业知识',
  'difficulty': '困难',
  'type': 'professional',
  'ideal': '推理引擎选型：高并发在线服务首选 vLLM（ PagedAttention + Continuous Batching 连 续批处理，生态最完善）或 SGLang（ '
           'RadixAttention 自动前缀树缓存 + 高速结构化 JSON 约束解码，极适合多轮 Agent 场景）；极致硬件压榨选 TensorRT-LLM；端 侧 /CPU '
           '本地部署选 llama.cpp。 解码参数：Temperature（温度，缩放 Logits 分布：趋近 0 接近贪心确定性输出，适 合代码 / '
           '数学；调高增加多样性）、Top-K（仅保留概率最高的 K 个候选词）、Top-P / Nucleus Sampling（按概率从高到低累加直至达到阈值 P 的动态候选集）。 '
           'AI 大模型与前沿方向高频面试题库（ AIGC-Interview-Book / 小林 coding ） Page 6 of 6',
  'tags': ['AI大模型', '后训练', '推理'],
  'assessment_points': '考察大模型训练对齐与推理部署的工程理解。'}]
