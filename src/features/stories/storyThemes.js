/** Six behavioral story themes (aligned with product spec). */
export const STORY_THEMES = [
  {
    id: 'leadership',
    label: '领导力',
    hint: '主导项目、带团队拿结果',
    practiceTo: '/questions/Q001',
    practiceLabel: '练「成功项目」行为题',
  },
  {
    id: 'conflict',
    label: '冲突',
    hint: '分歧、对抗与协商',
    practiceTo: '/questions/G005',
    practiceLabel: '练「意见不一致」通用题',
  },
  {
    id: 'failure',
    label: '失败',
    hint: '失误、复盘与改进',
    practiceTo: '/questions/G004',
    practiceLabel: '练「失败与改进」通用题',
  },
  {
    id: 'teamwork',
    label: '协作',
    hint: '跨团队合作与配合',
    practiceTo: '/questions/Q002',
    practiceLabel: '练「同事失误」行为题',
  },
  {
    id: 'pressure',
    label: '抗压',
    hint: '高压、时限与坚持',
    practiceTo: '/questions/Q005',
    practiceLabel: '练「压力题」',
  },
  {
    id: 'innovation',
    label: '创新',
    hint: '新方法、突破与实验',
    practiceTo: '/interview/lobby?type=semi&difficulty=medium',
    practiceLabel: '开始半结构化练习',
  },
]

export function buildThemeCoverage(stories) {
  const counts = Object.fromEntries(STORY_THEMES.map((t) => [t.id, 0]))
  for (const story of stories || []) {
    for (const themeId of story.themes || []) {
      if (themeId in counts) counts[themeId] += 1
    }
  }
  return STORY_THEMES.map((theme) => ({
    ...theme,
    count: counts[theme.id] || 0,
    covered: (counts[theme.id] || 0) > 0,
  }))
}
