import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

describe('Boost 6 User Requirements & Reviewer Fixes Verification', () => {
  it('Req 1: Daytime cyber-pixel white outfit theme is active in tokens, index.css, and feature modules', () => {
    const tokens = read('src/styles/tokens.css')
    const indexCss = read('src/index.css')
    assert.match(tokens, /:root\[data-theme="light"\]/)
    assert.match(tokens, /--canvas:\s*#f4f6fb/)
    assert.match(indexCss, /\[data-theme="light"\]\s*body/)
    assert.match(indexCss, /\[data-theme="light"\]\s*\.hw-panel/)

    const resumeCss = read('src/features/resume/Resume.module.css')
    assert.doesNotMatch(resumeCss, /rgba\(22,\s*21,\s*33/)
  })

  it('Req 2: AI Copilot point-to-surface edge ambient light, bottom dock popup, and Korean minimal 2D GrokBotIcon', () => {
    const copilotJsx = read('src/components/AICopilot/AICopilot.jsx')
    const copilotCss = read('src/components/AICopilot/AICopilot.module.css')
    assert.match(copilotJsx, /edge-glow-overlay/)
    assert.match(copilotCss, /@keyframes edgePointToSurfaceSpread/)
    assert.match(copilotCss, /\.panel\s*\{[\s\S]*bottom:\s*20px/)
    // Unique clipPath id via useId()
    assert.match(copilotJsx, /useId\(\)/)
    assert.match(copilotJsx, /grok-bot-canvas-clip-\$\{/)
    // 1:1 #121316 background, 18deg clockwise tilt, oval cheek blushes, vertical capsule eyes (8x22 rx=4)
    assert.match(copilotJsx, /fill="#121316"/)
    assert.match(copilotJsx, /rotate\(18\)/)
    assert.match(copilotJsx, /fill="#E0948E"/)
    assert.match(copilotJsx, /width="8"\s+height="22"\s+rx="4"\s+ry="4"\s+fill="#101114"/)
  })

  it('Req 3: SettingsModal splits Voice and Accessibility into left sidebar and unifies select widths & left-shifted chevron', () => {
    const settingsJsx = read('src/components/SettingsModal/SettingsModal.jsx')
    const settingsCss = read('src/components/SettingsModal/SettingsModal.module.css')
    assert.match(settingsJsx, /id:\s*'general',\s*icon:\s*'⚙',\s*label:\s*'常规'/)
    assert.match(settingsJsx, /id:\s*'voice',\s*icon:\s*'🔊',\s*label:\s*'语音朗读'/)
    assert.match(settingsJsx, /id:\s*'a11y',\s*icon:\s*'♿',\s*label:\s*'无障碍'/)
    assert.match(settingsCss, /width:\s*220px/)
    assert.match(settingsCss, /border-radius:\s*var\(--radius-md,\s*10px\)/)
    assert.match(settingsCss, /background-position:\s*right\s+1[45]px\s+center/)
  })

  it('Req 4: Dashboard removes Next Recommendation, adds 4-layer mechanical split-flap clock, and radar hover popup + enlarged corner labels', () => {
    const dashJsx = read('src/features/dashboard/Dashboard.jsx')
    const dashCss = read('src/features/dashboard/Dashboard.module.css')
    assert.doesNotMatch(dashJsx, /下一步推荐/)
    assert.match(dashJsx, /MechanicalFlipClock/)
    assert.match(dashJsx, /flip-leaf-front/)
    assert.match(dashJsx, /flip-leaf-back/)
    assert.match(dashCss, /height:\s*200%/)
    assert.match(dashJsx, /RadarHoverPopup/)
    assert.match(dashJsx, /onHoverAxis=\{setHoveredCornerAxis\}/)
    assert.match(dashJsx, /outerRadius="64%"/)
    assert.match(dashCss, /\.radar-corner-label\s*\{[\s\S]*font-size:\s*14\.5px/)
  })

  it('Req 5: LGD multi-agent sandbox API, Werewolf turn-taking, fast-training scripts, Memory Mode, and turnEpochRef guard', () => {
    const lgdRoomJsx = read('src/features/lgd/LGDRoom.jsx')
    const lgdLobbyJsx = read('src/features/lgd/LGDLobby.jsx')
    assert.match(lgdRoomJsx, /turnEpochRef/)
    assert.match(lgdRoomJsx, /requestLgdAgentTurn/)
    assert.match(lgdLobbyJsx, /记忆模式/)
    assert.match(lgdLobbyJsx, /群面多Agent API与沙箱设定/)
  })

  it('Req 6: Global rounded-rectangle (10px) form controls, left-shifted select chevron (!important), and unified 40px height', () => {
    const indexCss = read('src/index.css')
    const selectJsx = read('src/components/ui/Select.jsx')
    assert.match(selectJsx, /data-custom-select="true"/)
    assert.match(indexCss, /select:not\(\[data-custom-select="true"\]\)/)
    assert.match(indexCss, /background-position:\s*right\s+14px\s+center\s*!important/)
    assert.match(indexCss, /border-radius:\s*var\(--radius-md,\s*10px\)/)

    const lobbyCss = read('src/features/interview/InterviewLobby.module.css')
    assert.match(lobbyCss, /\.round-fields-row/)
    assert.match(lobbyCss, /background-color:\s*var\(--bg-elevated\)/)
  })

  it('Req 7: PermadeathChallenge full-pipeline Boss Gauntlet streams LGD, Interview, Follow-up, Negotiation, Story/JD assets, and Research/Survey hooks', () => {
    const challengeJsx = read('src/features/challenge/PermadeathChallenge.jsx')
    assert.match(challengeJsx, /createSession/)
    assert.match(challengeJsx, /scoreInterviewAnswer/)
    assert.match(challengeJsx, /postQuestionFollowup/)
    assert.match(challengeJsx, /postNegotiationTurn/)
    assert.match(challengeJsx, /completeSession/)
    assert.match(challengeJsx, /requestLgdAgentTurn/)
    assert.match(challengeJsx, /scoreLgd/)
    assert.match(challengeJsx, /listJobs/)
    assert.match(challengeJsx, /listStories/)
    assert.match(challengeJsx, /trackResearchEvent/)
    assert.match(challengeJsx, /checkPendingSurvey\('challenge'\)/)
    assert.doesNotMatch(challengeJsx, /Math\.random\(\)\s*\*\s*35/)
  })
})
