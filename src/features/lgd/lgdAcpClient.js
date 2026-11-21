import {
  AGENTS,
  RESPONSES,
  agentById,
  computeLocalUrgencyBids,
  getIdentityMeta,
  getScriptById,
  inferAgentClaimedIdentity,
  resolveParticipantSeat,
} from './lgdScripts.js'

export const ACP_PROTOCOL_VERSION = 'edgewise.acp.a2a.v1'

function readAuthTokenSafe() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem('edgewise-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.accessToken || null
  } catch {
    return null
  }
}

function resolveApiBaseUrl() {
  try {
    return (import.meta?.env?.VITE_API_BASE || '/api/v1').replace(/\/$/, '')
  } catch {
    return '/api/v1'
  }
}

function splitOralChunks(text) {
  const str = String(text || '').trim()
  if (!str) return []
  const chunks = []
  let buf = ''
  for (const ch of str) {
    buf += ch
    if ('，。！？；：、'.includes(ch) || buf.length >= 8) {
      chunks.push(buf)
      buf = ''
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

function sleepAbortable(ms, signal) {
  if (signal?.aborted) {
    const err = new Error('Aborted')
    err.name = 'AbortError'
    return Promise.reject(err)
  }
  if (!ms || ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      const err = new Error('Aborted')
      err.name = 'AbortError'
      reject(err)
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Deterministic client-side ACP/A2A stream generator when offline or in `fast_script_only` mode.
 */
export async function simulateLocalAcpStream(payload = {}, options = {}) {
  const { signal, onEvent, fallbackText, chunkDelayMs = 32 } = options
  const phase = payload.phase || 'free_discussion'
  const scriptId = payload.script_id || 'standard_flow'
  const transcript = payload.transcript || []
  const turnIdx = payload.turn_index || 0
  const seatMap = payload.seat_map || null
  const identityMode = payload.identity_mode || 'random'
  const participantRoles = payload.participant_roles || null

  let targetAgentId = payload.agent_id || null
  let chosenIntent = '结合当前讨论推进共识'
  let thoughtText = '正在结合场上观点组织接话切入点…'

  if (!targetAgentId || phase === 'free_discussion') {
    const bids = computeLocalUrgencyBids({
      messages: transcript,
      scriptId,
      remainingSeconds: payload.remaining_seconds ?? 420,
      totalPhaseSeconds: payload.total_phase_seconds ?? 600,
      memorySnapshot: payload.memory_snapshot || null,
      turnIndex: turnIdx,
      seatMap,
      identityMode,
      participantRoles,
      visualBoardSummary: payload.visual_board_summary || '',
    })
    const winner = targetAgentId
      ? bids.find((b) => b.agent_id === targetAgentId) || bids[0]
      : bids[0]
    targetAgentId = winner.agent_id
    chosenIntent = winner.intent
    thoughtText = winner.thought_preview
    if (phase === 'free_discussion') {
      onEvent?.({
        protocol: ACP_PROTOCOL_VERSION,
        type: 'bidding_round',
        winner_agent_id: winner.agent_id,
        winner_seat: winner.seat,
        winner_name: winner.name,
        winner_role: winner.role,
        urgency: winner.urgency,
        intent: winner.intent,
        candidates: bids.slice(0, 3),
        speaker_queue: bids.slice(0, 4),
      })
    }
  } else if (phase === 'personal_statement') {
    const ag = agentById(targetAgentId, seatMap, participantRoles) || AGENTS[0]
    thoughtText = `${ag.seat}号·${ag.name} 正在梳理个人陈述核心框架…`
  } else if (phase === 'summary_report') {
    thoughtText = '正在结合共享看板共识、量化依据与保留分歧，准备结构化汇报…'
  } else if (phase === 'examiner_followup') {
    thoughtText = '正在围绕考官压力追问补充团队底线逻辑…'
  }

  const baseAgent = AGENTS.find((a) => a.id === targetAgentId) || AGENTS[0]
  const seatNum = resolveParticipantSeat(baseAgent.id, seatMap)
  const currentRoleKey = participantRoles?.[baseAgent.id]
  let claimedRole = null
  let claimedRoleLabel = null
  let effectiveRoleLabel = baseAgent.role
  if (identityMode === 'undetermined' && (!currentRoleKey || currentRoleKey === 'undetermined')) {
    const cMeta = inferAgentClaimedIdentity(baseAgent.id, participantRoles || {}, phase)
    claimedRole = cMeta.id
    claimedRoleLabel = cMeta.short
    effectiveRoleLabel = cMeta.short
  } else if (currentRoleKey) {
    effectiveRoleLabel = getIdentityMeta(currentRoleKey).short
  }
  const agent = {
    ...baseAgent,
    seat: seatNum,
    role: effectiveRoleLabel,
  }
  const pool =
    (RESPONSES[phase] && RESPONSES[phase][agent.id]) ||
    (phase === 'summary_report' ? RESPONSES.summary_report.logician : null) ||
    RESPONSES.free_discussion.ice_breaker
  const lineText = fallbackText || pool[turnIdx % pool.length] || pool[0]

  let thoughtAcc = ''
  let spokenAcc = ''
  const turnId = `local-turn-${Date.now().toString(36)}`

  try {
    onEvent?.({
      protocol: ACP_PROTOCOL_VERSION,
      type: 'seat_state',
      turn_id: turnId,
      agent_id: agent.id,
      seat: agent.seat,
      ui_state: 'thinking',
    })

    for (const piece of splitOralChunks(thoughtText)) {
      await sleepAbortable(Math.max(0, Math.round(chunkDelayMs * 0.75)), signal)
      thoughtAcc += piece
      onEvent?.({
        protocol: ACP_PROTOCOL_VERSION,
        type: 'agent_thought_chunk',
        turn_id: turnId,
        agent_id: agent.id,
        seat: agent.seat,
        delta: piece,
        thought: thoughtAcc,
      })
    }

    await sleepAbortable(chunkDelayMs, signal)
    onEvent?.({
      protocol: ACP_PROTOCOL_VERSION,
      type: 'seat_state',
      turn_id: turnId,
      agent_id: agent.id,
      seat: agent.seat,
      ui_state: 'speaking',
    })

    for (const chunk of splitOralChunks(lineText)) {
      await sleepAbortable(chunkDelayMs, signal)
      spokenAcc += chunk
      onEvent?.({
        protocol: ACP_PROTOCOL_VERSION,
        type: 'agent_message_chunk',
        turn_id: turnId,
        agent_id: agent.id,
        seat: agent.seat,
        agent_name: agent.name,
        agent_role: agent.role,
        delta: chunk,
        accumulated: spokenAcc,
      })
    }

    const finalEvent = {
      protocol: ACP_PROTOCOL_VERSION,
      type: 'message_final',
      turn_id: turnId,
      agent_id: agent.id,
      seat: agent.seat,
      agent_name: agent.name,
      agent_role: agent.role,
      claimed_role: claimedRole,
      claimed_role_label: claimedRoleLabel,
      sandbox_id: `sbx-${agent.seat}号-${agent.id}`,
      context_limit: agent.contextLimit || 4,
      script_badge: getScriptById(scriptId).badge,
      engine_source: payload.api_mode === 'fast_script_only' ? 'fast_script_only' : 'local_acp_fallback',
      intent: chosenIntent,
      thought: thoughtAcc,
      content: spokenAcc,
    }
    onEvent?.(finalEvent)
    onEvent?.({
      protocol: ACP_PROTOCOL_VERSION,
      type: 'seat_state',
      turn_id: turnId,
      agent_id: agent.id,
      seat: agent.seat,
      ui_state: 'listening',
    })
    return { aborted: false, finalEvent }
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      const abortEvent = {
        protocol: ACP_PROTOCOL_VERSION,
        type: 'turn_aborted',
        turn_id: turnId,
        agent_id: agent.id,
        seat: agent.seat,
        agent_name: agent.name,
        agent_role: agent.role,
        reason: 'client_aborted',
        partial_content: spokenAcc,
        thought: thoughtAcc,
      }
      onEvent?.({
        protocol: ACP_PROTOCOL_VERSION,
        type: 'seat_state',
        turn_id: turnId,
        agent_id: agent.id,
        seat: agent.seat,
        ui_state: spokenAcc ? 'interrupted' : 'listening',
      })
      onEvent?.(abortEvent)
      return { aborted: true, partialContent: spokenAcc, agent }
    }
    throw err
  }
}

/**
 * Stream an ACP/A2A LGD turn via FastAPI SSE (`/lgd/rooms/:id/stream-turn`),
 * supporting instant `AbortController` barge-in and automatic offline ACP stream fallback.
 */
export async function streamLgdAcpTurn(roomId, payload = {}, options = {}) {
  const { signal, onEvent, fallbackText, chunkDelayMs = 32, fetchImpl } = options

  if (payload.api_mode === 'fast_script_only') {
    return simulateLocalAcpStream(payload, { signal, onEvent, fallbackText, chunkDelayMs })
  }

  const effectiveFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!effectiveFetch) {
    return simulateLocalAcpStream(payload, { signal, onEvent, fallbackText, chunkDelayMs })
  }

  const safeRoom = encodeURIComponent(roomId || 'live')
  const url = `${resolveApiBaseUrl()}/lgd/rooms/${safeRoom}/stream-turn`
  const token = readAuthTokenSafe()
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  let lastAgentMeta = null
  let spokenAcc = ''
  let thoughtAcc = ''
  let receivedAnyStreamEvent = false
  let finalEvent = null

  try {
    const resp = await effectiveFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    })

    if (!resp.ok || !resp.body) {
      throw new Error(`HTTP ${resp.status}`)
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''

      for (const rawFrame of frames) {
        const line = rawFrame
          .split('\n')
          .find((l) => l.startsWith('data:'))
        if (!line) continue
        const jsonStr = line.slice(5).trim()
        if (!jsonStr) continue
        let ev = null
        try {
          ev = JSON.parse(jsonStr)
        } catch {
          continue
        }
        receivedAnyStreamEvent = true
        if (ev.agent_id) {
          lastAgentMeta = {
            id: ev.agent_id,
            seat: ev.seat,
            name: ev.agent_name,
            role: ev.agent_role,
          }
        }
        if (ev.type === 'agent_thought_chunk') {
          thoughtAcc = ev.thought || thoughtAcc + (ev.delta || '')
        } else if (ev.type === 'agent_message_chunk') {
          spokenAcc = ev.accumulated || spokenAcc + (ev.delta || '')
        } else if (ev.type === 'message_final') {
          finalEvent = ev
          spokenAcc = ev.content || spokenAcc
        } else if (ev.type === 'lock_state' && ev.locked) {
          onEvent?.(ev)
          return { aborted: false, locked: true, lockEvent: ev }
        } else if (ev.type === 'turn_aborted') {
          onEvent?.(ev)
          return {
            aborted: true,
            partialContent: ev.partial_content ?? spokenAcc,
            agent: lastAgentMeta ? agentById(lastAgentMeta.id) || lastAgentMeta : null,
          }
        }
        onEvent?.(ev)
      }
    }

    if (finalEvent) {
      return { aborted: false, finalEvent }
    }
    if (!receivedAnyStreamEvent) {
      return simulateLocalAcpStream(payload, { signal, onEvent, fallbackText, chunkDelayMs })
    }
    return { aborted: false, finalEvent: null }
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      const resolvedAgent = lastAgentMeta ? agentById(lastAgentMeta.id) || lastAgentMeta : null
      if (resolvedAgent) {
        onEvent?.({
          protocol: ACP_PROTOCOL_VERSION,
          type: 'seat_state',
          agent_id: resolvedAgent.id,
          seat: resolvedAgent.seat,
          ui_state: spokenAcc ? 'interrupted' : 'listening',
        })
        onEvent?.({
          protocol: ACP_PROTOCOL_VERSION,
          type: 'turn_aborted',
          agent_id: resolvedAgent.id,
          seat: resolvedAgent.seat,
          agent_name: resolvedAgent.name,
          agent_role: resolvedAgent.role,
          reason: 'client_aborted',
          partial_content: spokenAcc,
          thought: thoughtAcc,
        })
      }
      return { aborted: true, partialContent: spokenAcc, agent: resolvedAgent }
    }
    if (!spokenAcc) {
      return simulateLocalAcpStream(payload, { signal, onEvent, fallbackText, chunkDelayMs })
    }
    return { aborted: false, finalEvent }
  }
}
