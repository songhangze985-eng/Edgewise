"""Seed coding practice questions (LeetCode-style, for local runner only)."""

SEED_CODING_QUESTIONS = [
    {
        "id": "C001",
        "title": "两数之和",
        "category": "编程题",
        "difficulty": "简单",
        "type": "coding",
        "coding_language": "javascript",
        "entry_point": "twoSum",
        "problem_statement": (
            "给定整数数组 nums 和一个整数 target，在数组中找出和为目标值 target 的两个整数，"
            "返回它们的数组下标。假设每组输入恰好对应一个答案，且同一元素不能使用两次。"
        ),
        "signature": "function twoSum(nums, target) {\n  // 返回下标数组，如 [0, 1]\n}",
        "starter_code": "function twoSum(nums, target) {\n  \n}\n",
        "samples": [
            {"args": [[2, 7, 11, 15], 9], "expected": [0, 1]},
            {"args": [[3, 2, 4], 6], "expected": [1, 2]},
        ],
        "hidden_tests": [
            {"args": [[3, 3], 6], "expected": [0, 1]},
            {"args": [[-1, -2, -3, -4, -5], -8], "expected": [2, 4]},
        ],
        "follow_ups": [
            "请口述：为什么可以用哈希表？时间/空间复杂度各是多少？",
            "如果数组已排序，你会怎么优化？",
            "有哪些边界情况需要处理？",
        ],
        "tags": ["数组", "哈希表"],
    },
    {
        "id": "C002",
        "title": "有效的括号",
        "category": "编程题",
        "difficulty": "中等",
        "type": "coding",
        "coding_language": "javascript",
        "entry_point": "isValid",
        "problem_statement": (
            "给定一个只包括 '('，')'，'{'，'}'，'['，']' 的字符串 s ，"
            "判断字符串是否有效。有效需满足：左括号必须用相同类型的右括号闭合，且以正确顺序闭合。"
        ),
        "signature": "function isValid(s) {\n  // 返回 true / false\n}",
        "starter_code": "function isValid(s) {\n  \n}\n",
        "samples": [
            {"args": ["()"], "expected": True},
            {"args": ["()[]{}"], "expected": True},
            {"args": ["(]"], "expected": False},
        ],
        "hidden_tests": [
            {"args": ["([{}])"], "expected": True},
            {"args": ["{[]}"], "expected": True},
            {"args": ["(("], "expected": False},
        ],
        "follow_ups": [
            "栈在这里起什么作用？最坏情况下的复杂度？",
            "若字符串很长且括号类型很多，你会如何测试？",
        ],
        "tags": ["栈", "字符串"],
    },
    {
        "id": "C003",
        "title": "反转字符串",
        "category": "编程题",
        "difficulty": "简单",
        "type": "coding",
        "coding_language": "python",
        "entry_point": "reverse_string",
        "problem_statement": (
            "编写函数 reverse_string(s)，接收字符列表 s，原地反转列表。"
            "不要使用额外数组空间（Python 中可在列表上原地交换）。"
        ),
        "signature": "def reverse_string(s):\n    \"\"\"s: list[str]\"\"\"\n    pass",
        "starter_code": "def reverse_string(s):\n    pass\n",
        "samples": [
            {"args": [["h", "e", "l", "l", "o"]], "expected": ["o", "l", "l", "e", "h"]},
            {"args": [["H", "a", "n", "a", "h"]], "expected": ["h", "a", "n", "a", "H"]},
        ],
        "hidden_tests": [
            {"args": [["a"]], "expected": ["a"]},
            {"args": [["A", " ", "m", "a", "n"]], "expected": ["n", "a", "m", " ", "A"]},
        ],
        "follow_ups": [
            "双指针与额外数组各有什么权衡？",
            "Unicode 代理对在这种题里需要注意吗？",
        ],
        "tags": ["双指针", "字符串"],
    },
    {
        "id": "C004",
        "title": "最大子数组和",
        "category": "编程题",
        "difficulty": "中等",
        "type": "coding",
        "coding_language": "javascript",
        "entry_point": "maxSubArray",
        "problem_statement": (
            "给定整数数组 nums ，找到一个具有最大和的连续子数组（至少包含一个元素），"
            "返回其最大和。"
        ),
        "signature": "function maxSubArray(nums) {\n  // 返回最大和\n}",
        "starter_code": "function maxSubArray(nums) {\n  \n}\n",
        "samples": [
            {"args": [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], "expected": 6},
            {"args": [[1]], "expected": 1},
        ],
        "hidden_tests": [
            {"args": [[5, 4, -1, 7, 8]], "expected": 23},
            {"args": [[-1]], "expected": -1},
        ],
        "follow_ups": [
            "Kadane 算法的核心不变量是什么？",
            "若要求输出子数组本身而非和，你会怎么改？",
        ],
        "tags": ["动态规划", "数组"],
    },
]

CODING_FOLLOWUP_TEMPLATES = [
    "请口述你的整体思路：先做什么、为什么？",
    "时间复杂度与空间复杂度分别是多少？能否再优化？",
    "有哪些边界或异常输入需要单独处理？",
]
