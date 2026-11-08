from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class MessageResponse(APIModel):
    message: str


class UserRegister(APIModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class UserLogin(APIModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class ResearchConsentView(APIModel):
    accepted: bool | None = None
    accepted_at: str | None = None
    withdrawn_at: str | None = None
    had_declined: bool | None = None
    version: str


class ResearchConsentUpdate(APIModel):
    accepted: bool
    experiment_arm: str | None = Field(default=None, pattern=r"^(00|01|10|11)$")


class ExperimentFactorsView(APIModel):
    continuity: int = Field(ge=0, le=1)
    participation: int = Field(ge=0, le=1)


class ExperimentAssignmentView(APIModel):
    arm: str
    factors: ExperimentFactorsView
    assigned_at: str
    source: str


class ResearchExperimentContext(APIModel):
    assignment: ExperimentAssignmentView | None = None
    participation_mode: str | None = None
    task_continuity: str | None = None
    continuity_prefill: dict[str, Any] = Field(default_factory=dict)
    experiment_practice_completed: bool = False


class ResearchPosttestStatus(APIModel):
    due: bool = False
    overdue: bool = False
    completed: bool = False
    due_at: str | None = None
    completed_at: str | None = None
    followup_task_open: bool = False
    followup_task_due_at: str | None = None
    probe: dict[str, Any] | None = None


class ResearchPosttestSubmit(APIModel):
    answer: str = Field(min_length=1, max_length=8000)


class ResearchInviteView(APIModel):
    invite_code: str
    invite_path: str
    referral_incentive: str


class ReferralClaimUpdate(APIModel):
    invite_code: str = Field(min_length=4, max_length=32)


class ReferralStatsRow(APIModel):
    inviter_id: str
    inviter_email: str | None = None
    invite_code: str | None = None
    referral_incentive: str | None = None
    assigned_invitees: int
    eligible_practice_invitees: int
    net_contribution_count: int


class ResearchFollowupUpdate(APIModel):
    viewed_feedback: bool | None = None
    revised: bool | None = None
    declined_revision_reason: str | None = Field(default=None, max_length=500)


class ResearchClientEvent(APIModel):
    event: str = Field(min_length=3, max_length=80)
    ts: str | None = None
    props: dict[str, Any] = Field(default_factory=dict)


class ResearchEventsBatch(APIModel):
    events: list[ResearchClientEvent] = Field(min_length=1, max_length=100)


class ResearchEventsBatchResponse(APIModel):
    accepted: int
    event_ids: list[str] = Field(default_factory=list)


class SurveyItemView(APIModel):
    id: str
    text: str
    type: str
    options: list[str] = Field(default_factory=list)
    reverse: bool = False


class ResearchSurveyPending(APIModel):
    items: list[SurveyItemView] = Field(default_factory=list)
    survey_version: str
    blocked_reason: str | None = None


class ResearchSurveyAnswerItem(APIModel):
    item_id: str = Field(min_length=1, max_length=20)
    value: str | int | None = None
    skipped: bool = False


class ResearchSurveyAnswerBatch(APIModel):
    answers: list[ResearchSurveyAnswerItem] = Field(min_length=1, max_length=3)


class BlindReviewScoreSubmit(APIModel):
    review_token: str
    scores: dict[str, int] = Field(default_factory=dict)


class BlindReviewItem(APIModel):
    review_token: str
    answer: str | None = None


class UserPublic(APIModel):
    id: str
    email: str
    name: str
    initials: str
    tier: str
    tier_label: str
    credits: int
    join_date: str
    is_admin: bool = False
    research_consent: ResearchConsentView | None = None
    experiment_assignment: ExperimentAssignmentView | None = None
    posttest_due_at: str | None = None
    followup_task_due_at: str | None = None
    posttest_completed_at: str | None = None
    invite_code: str | None = None
    referred_by: str | None = None
    referral_incentive: str | None = None
    created_at: str
    updated_at: str


class UserInDB(UserPublic):
    password_hash: str


class TokenResponse(APIModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserPublic


class DashboardOverview(APIModel):
    total_sessions: int
    avg_score: float
    streak: int
    credits: int


class ResumeExperienceItem(APIModel):
    company: str
    role: str
    period: str
    desc: str


class ResumeProjectItem(APIModel):
    name: str
    desc: str


class ResumeParsedData(APIModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    education: str | None = None
    experience: list[ResumeExperienceItem] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    projects: list[ResumeProjectItem] = Field(default_factory=list)


class ResumeSuggestion(APIModel):
    id: str
    category: str
    text: str
    impact: int
    applied: bool = False


class ResumeResponse(APIModel):
    id: str
    user_id: str
    file_name: str
    file_size: str
    size: int
    content_type: str
    status: str
    uploaded_at: str
    preview_text: str | None = None
    content_base64: str
    parsed_data: ResumeParsedData | None = None
    suggestions: list[ResumeSuggestion] = Field(default_factory=list)
    optimized_text: str | None = None
    jd_match_score: int | None = None
    jd_keywords: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class LgdParticipant(APIModel):
    user_id: str
    name: str
    role: str


class LgdRoomCreate(APIModel):
    topic: str = Field(min_length=2, max_length=200)
    material: str | None = Field(default=None, max_length=5000)
    topic_id: str | None = Field(default=None, max_length=80)
    topic_type: str | None = Field(default=None, max_length=40)
    max_participants: int = Field(default=8, ge=2, le=8)
    duration_minutes: int = Field(default=20, ge=5, le=180)
    agents: list[str] = Field(default_factory=list)
    user_role: str = Field(default="member", max_length=20)
    role_mode: str = Field(default="pick", max_length=20)
    script_id: str = Field(default="standard_flow", max_length=60)
    memory_enabled: bool = True
    api_mode: str = Field(default="hybrid_sandbox", max_length=40)


class LgdPhaseConfig(APIModel):
    name: str
    seconds: int


class LgdRoomResponse(APIModel):
    id: str
    host_user_id: str
    topic: str
    material: str | None = None
    topic_id: str | None = None
    topic_type: str | None = None
    status: str
    phase: str
    participant_count: int
    max_participants: int
    duration_minutes: int
    remaining_seconds: int
    agents: list[str] = Field(default_factory=list)
    phases: list[LgdPhaseConfig] = Field(default_factory=list)
    user_role: str | None = None
    script_id: str | None = "standard_flow"
    memory_enabled: bool = True
    api_mode: str | None = "hybrid_sandbox"
    participants: list[LgdParticipant] = Field(default_factory=list)
    created_at: str
    updated_at: str


class InterviewRoundMix(APIModel):
    general: int = Field(default=1, ge=0, le=8)
    resume_specific: int = Field(default=1, ge=0, le=8)
    professional: int = Field(default=1, ge=0, le=8)


class InterviewRoundConfig(APIModel):
    name: str = Field(min_length=1, max_length=80)
    question_count: int = Field(default=3, ge=1, le=8)
    mix: InterviewRoundMix = Field(default_factory=InterviewRoundMix)
    type: str = Field(
        default="standard",
        pattern=r"^(standard|hr|negotiation|case|system_design)$",
    )
    reverse_qa: bool = False
    case_id: str | None = Field(default=None, max_length=80)


class CaseSessionCreate(APIModel):
    case_id: str = Field(min_length=1, max_length=80)
    kind: str = Field(default="case", pattern=r"^(case|system_design)$")
    title: str | None = Field(default=None, max_length=200)
    position: str | None = Field(default=None, max_length=200)
    difficulty: str | None = Field(default=None, max_length=50)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CaseClarifyRequest(APIModel):
    round_index: int = Field(ge=0, le=4)
    text: str = Field(min_length=1, max_length=2000)


class CaseStepCompleteRequest(APIModel):
    round_index: int = Field(ge=0, le=4)
    step_id: str = Field(min_length=2, max_length=40)
    answer: str = Field(max_length=12000)
    whiteboard_snapshot: dict[str, Any] | None = None


class NegotiationTurnRequest(APIModel):
    round_index: int = Field(ge=0, le=4)
    message: str = Field(min_length=1, max_length=4000)


class ReverseQaSubmit(APIModel):
    round_index: int = Field(ge=0, le=4)
    questions: list[str] = Field(default_factory=list, max_length=3)


class JobCreate(APIModel):
    raw_text: str = Field(min_length=1, max_length=50000)
    title: str | None = Field(default=None, max_length=120)
    keywords: list[str] | None = Field(default=None, max_length=40)


class JobResponse(APIModel):
    id: str
    title: str | None = None
    raw_text: str
    keywords: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str
    short_text_warning: bool = False
    needs_manual_keywords: bool = False


class JobMatchResponse(APIModel):
    job_id: str
    resume_id: str
    overlap: list[str] = Field(default_factory=list)
    jd_only: list[str] = Field(default_factory=list)
    resume_only: list[str] = Field(default_factory=list)
    coverage: float = Field(ge=0, le=100)


class CodingSessionCreate(APIModel):
    mode: str = Field(pattern=r"^(interview|exam)$")
    question_id: str | None = Field(default=None, max_length=50)
    duration_minutes: int | None = Field(default=None, ge=15, le=180)
    difficulty: str | None = Field(default=None, max_length=50)
    source: str | None = Field(default=None, max_length=80)


class CodingAttemptRecord(APIModel):
    question_id: str = Field(min_length=1, max_length=50)
    language: str = Field(min_length=2, max_length=20)
    source: str = Field(max_length=50000)
    kind: str = Field(pattern=r"^(run|submit)$")
    tests_passed: int = Field(ge=0, le=200)
    tests_total: int = Field(ge=0, le=200)
    case_results: list[dict[str, Any]] = Field(default_factory=list, max_length=200)


class CodingExplainUpdate(APIModel):
    transcript: str = Field(max_length=50000)
    speech_metrics: dict[str, Any] | None = None


class InterviewSessionCreate(APIModel):
    type: str = Field(default="interview", min_length=3, max_length=50)
    position: str | None = Field(default=None, max_length=200)
    difficulty: str | None = Field(default=None, max_length=50)
    topic: str | None = Field(default=None, max_length=200)
    question_id: str | None = Field(default=None, max_length=50)
    job_id: str | None = Field(default=None, max_length=64)
    rounds: list[InterviewRoundConfig] | None = Field(default=None, max_length=5)
    metadata: dict[str, Any] = Field(default_factory=dict)


class InterviewAnswerScoreRequest(APIModel):
    round_index: int = Field(ge=0, le=4)
    question_index: int = Field(ge=0, le=7)
    answer_text: str = Field(max_length=8000)
    stt_failed: bool = False
    declined_personal: bool = False
    speech: dict[str, Any] | None = None
    delivery: dict[str, Any] | None = None
    presence: dict[str, Any] | None = None
    take_no: int | None = Field(default=None, ge=1, le=99)
    takes_used: int | None = Field(default=None, ge=1, le=99)


class QuestionAttemptRequest(APIModel):
    round_index: int = Field(ge=0, le=4)
    question_index: int = Field(ge=0, le=7)
    answer_text: str = Field(max_length=8000)
    stt_failed: bool = False
    speech: dict[str, Any] | None = None
    delivery: dict[str, Any] | None = None


class RevisionDecisionRequest(APIModel):
    round_index: int = Field(ge=0, le=4)
    question_index: int = Field(ge=0, le=7)
    decision: str = Field(pattern=r"^(revise|decline|skip)$")
    revised_text: str | None = Field(default=None, max_length=8000)
    decline_reason: str | None = Field(default=None, max_length=500)
    probe_answer: str | None = Field(default=None, max_length=4000)
    feedback_viewed: bool = False


class FollowupRequest(APIModel):
    round_index: int = Field(ge=0, le=4)
    question_index: int = Field(ge=0, le=7)
    answer_text: str | None = Field(default=None, max_length=8000)
    stt_failed: bool = False
    speech: dict[str, Any] | None = None
    delivery: dict[str, Any] | None = None


class InterviewSessionMetadataUpdate(APIModel):
    metadata: dict[str, Any] = Field(default_factory=dict)


class InterviewSessionComplete(APIModel):
    score: float | None = Field(default=None, ge=0, le=100)
    duration_minutes: int | None = Field(default=None, ge=1, le=240)
    dimensions: dict[str, float] = Field(default_factory=dict)
    messages: list[dict[str, Any]] | None = None
    transcript: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


class SessionResponse(APIModel):
    id: str
    user_id: str
    type: str
    position: str | None = None
    difficulty: str | None = None
    topic: str | None = None
    question_id: str | None = None
    status: str
    score: float | None = None
    score_status: str | None = None
    duration_minutes: int | None = None
    date: str
    time: str
    created_at: str
    updated_at: str
    completed_at: str | None = None
    rounds: list[dict[str, Any]] | None = None
    lgd_metrics: dict[str, Any] | None = None
    code_attempts: list[dict[str, Any]] | None = None
    explain_transcript: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class QuestionStar(APIModel):
    s: str | None = None
    t: str | None = None
    a: str | None = None
    r: str | None = None


class QuestionHistoryItem(APIModel):
    date: str
    score: float
    comment: str


class QuestionRelatedItem(APIModel):
    id: str
    title: str


class QuestionResponse(APIModel):
    id: str
    title: str
    category: str
    difficulty: str
    type: str = "professional"
    lang: str | None = "zh-CN"
    structured_category: str | None = None
    source_label: str | None = None
    ideal: str | None = None
    star: QuestionStar | None = None
    assessment_points: str | None = None
    answer_structure: str | None = None
    follow_ups: list[str] = Field(default_factory=list)
    source_project: str | None = None
    keywords: list[str] = Field(default_factory=list)
    user_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    count: int = 0
    collected: bool = False
    history: list[QuestionHistoryItem] = Field(default_factory=list)
    related: list[QuestionRelatedItem] = Field(default_factory=list)
    created_at: str
    updated_at: str
    problem_statement: str | None = None
    signature: str | None = None
    starter_code: str | None = None
    coding_language: str | None = None
    entry_point: str | None = None
    samples: list[dict[str, Any]] | None = None
    hidden_tests: list[dict[str, Any]] | None = None


class QuestionUploadItem(APIModel):
    id: str
    title: str


class QuestionUploadResponse(APIModel):
    imported: int
    questions: list[QuestionUploadItem]
    preview_text_len: int


class ShareCardCreate(APIModel):
    session_id: str = Field(min_length=8, max_length=64)
    question_id: str = Field(min_length=1, max_length=64)
    include_excerpt: bool = False
    excerpt: str | None = Field(default=None, max_length=80)


class ShareCardCreateResponse(APIModel):
    share_id: str
    share_path: str
    include_excerpt: bool
    created_at: str


class ShareCardPublic(APIModel):
    share_id: str
    revoked: bool = False
    question_title: str | None = None
    gap_type: str | None = None
    gap_label: str | None = None
    method_text: str | None = None
    probe_text: str | None = None
    include_excerpt: bool = False
    excerpt: str | None = None
    created_at: str | None = None


class ShareCardRevokeResponse(APIModel):
    share_id: str
    revoked: bool


class PairCreate(APIModel):
    probe_text: str = Field(min_length=4, max_length=500)
    inviter_answer: str | None = Field(default=None, max_length=4000)
    share_id: str | None = Field(default=None, max_length=32)


class PairCreateResponse(APIModel):
    pair_id: str
    pair_path: str
    created_at: str


class PairAnswerSubmit(APIModel):
    answer: str = Field(min_length=1, max_length=4000)


class PairVisibilityUpdate(APIModel):
    visible: bool


class PairPracticeView(APIModel):
    pair_id: str
    probe_text: str | None = None
    inviter_answer: str | None = None
    invitee_answer: str | None = None
    visibility_inviter: bool = False
    visibility_invitee: bool = False
    viewer_role: str | None = None
    mutual_visible: bool = False
    created_at: str | None = None


class CopilotRouteView(APIModel):
    kind: str
    path: str
    label: str


class CopilotMicroTaskView(APIModel):
    prompt: str
    placeholder: str | None = None


class CopilotTriageRequest(APIModel):
    message: str = Field(min_length=1, max_length=2000)
    rejected_need: str | None = Field(default=None, max_length=32)
    clarify_answer: str | None = Field(default=None, max_length=2000)


class CopilotTriageResponse(APIModel):
    triage_id: str
    need: str
    confidence: float = Field(ge=0.0, le=1.0)
    judgment: str = ""
    micro_task: CopilotMicroTaskView | None = None
    route: CopilotRouteView | None = None
    limitation: str | None = None
    clarifying_question: str | None = None
    scope_id: str | None = None


class CopilotMicroTaskDoneRequest(APIModel):
    triage_id: str | None = Field(default=None, max_length=32)
    need: str = Field(min_length=1, max_length=32)
    answer: str = Field(min_length=1, max_length=2000)


class AssessmentAnswerSubmit(APIModel):
    section: str = Field(pattern=r"^(aptitude|personality)$")
    item_id: str | None = Field(default=None, max_length=32)
    choice_index: int | None = Field(default=None, ge=0, le=8)
    choice: str | None = Field(default=None, pattern=r"^(A|B)$")
    time_spent_sec: int | None = Field(default=None, ge=0, le=7200)
    block_category: str | None = Field(default=None, max_length=32)
    block_time_spent_sec: int | None = Field(default=None, ge=0, le=7200)


class AssessmentSessionResponse(APIModel):
    id: str
    user_id: str
    status: str
    disclaimer: str | None = None
    created_at: str
    updated_at: str
    completed_at: str | None = None
    aptitude_blocks: list[dict[str, Any]] = Field(default_factory=list)
    aptitude_items: list[dict[str, Any]] = Field(default_factory=list)
    personality_items: list[dict[str, Any]] = Field(default_factory=list)
    report: dict[str, Any] | None = None


class ScheduleCreate(APIModel):
    company: str = Field(min_length=1, max_length=120)
    stage: str = Field(min_length=1, max_length=20)
    at: str = Field(min_length=8, max_length=64)
    job_id: str | None = Field(default=None, max_length=64)
    result: str = Field(default="待定", max_length=10)
    note: str | None = Field(default=None, max_length=2000)


class ScheduleUpdate(APIModel):
    company: str | None = Field(default=None, min_length=1, max_length=120)
    stage: str | None = Field(default=None, min_length=1, max_length=20)
    at: str | None = Field(default=None, min_length=8, max_length=64)
    job_id: str | None = Field(default=None, max_length=64)
    clear_job_id: bool = False
    result: str | None = Field(default=None, max_length=10)
    note: str | None = Field(default=None, max_length=2000)


class ScheduleResponse(APIModel):
    id: str
    company: str
    stage: str
    at: str
    job_id: str | None = None
    result: str
    note: str = ""
    created_at: str
    updated_at: str


class ExperienceSubmit(APIModel):
    company: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=120)
    stage: str = Field(min_length=1, max_length=80)
    date_month: str = Field(min_length=4, max_length=20)
    questions: list[str] = Field(min_length=1, max_length=20)


class ExperienceView(APIModel):
    id: str
    company: str
    role: str
    stage: str
    date_month: str
    questions: list[str] = Field(default_factory=list)
    status: str
    created_at: str
    approved_at: str | None = None
    author_id: str | None = None


class ExperienceReviewSubmit(APIModel):
    decision: str = Field(pattern=r"^(approved|rejected)$")
    note: str | None = Field(default=None, max_length=500)


class StoryCreate(APIModel):
    title: str = Field(min_length=1, max_length=200)
    S: str = Field(default="", max_length=8000)
    T: str = Field(default="", max_length=8000)
    A: str = Field(default="", max_length=8000)
    R: str = Field(default="", max_length=8000)
    themes: list[str] = Field(default_factory=list, max_length=6)
    source_session: str | None = Field(default=None, max_length=64)
    source: str | None = Field(default="manual", max_length=32)


class StoryUpdate(APIModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    S: str | None = Field(default=None, max_length=8000)
    T: str | None = Field(default=None, max_length=8000)
    A: str | None = Field(default=None, max_length=8000)
    R: str | None = Field(default=None, max_length=8000)
    themes: list[str] | None = Field(default=None, max_length=6)


class StoryView(APIModel):
    id: str
    title: str
    S: str = ""
    T: str = ""
    A: str = ""
    R: str = ""
    themes: list[str] = Field(default_factory=list)
    source_session: str | None = None
    created_at: str
    updated_at: str


class CreatorEpisodeView(APIModel):
    id: str
    creator: str
    angle: str
    video_url: str = ""
    task_slug: str = ""
    summary: str = ""


class CreatorSeriesView(APIModel):
    id: str
    topic: str
    variant: str
    episodes: list[CreatorEpisodeView] = Field(default_factory=list)
    disclosure: str = ""
    published: bool = True


class CreatorSeriesUpsert(APIModel):
    topic: str | None = Field(default=None, max_length=200)
    variant: str | None = Field(default=None, max_length=32)
    episodes: list[dict[str, Any]] | None = None
    disclosure: str | None = Field(default=None, max_length=2000)
    published: bool | None = None


class OrgCreate(APIModel):
    name: str = Field(min_length=1, max_length=200)
    pilot_period: str = Field(min_length=1, max_length=120)
    service_description: str = Field(min_length=1, max_length=2000)
    fee_paid: bool = False
    invite_method: str = Field(default="admin_invite", max_length=64)
    human_coaching: bool = False
    admin_user_id: str | None = Field(default=None, max_length=64)


class OrgAdminListItem(APIModel):
    id: str
    name: str
    pilot_period: str
    invite_code: str
    fee_paid: bool
    invite_method: str
    human_coaching: bool
    member_count: int
    created_at: str | None = None


class OrgWorkshopCreate(APIModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    mode: str = Field(pattern=r"^(revision|pair)$")
    task_slug: str = Field(default="", max_length=80)


class OrgWorkshopView(APIModel):
    id: str
    org_id: str
    title: str
    description: str = ""
    mode: str
    task_slug: str = ""
    created_at: str


class OrgJoinPreview(APIModel):
    org_id: str
    name: str
    pilot_period: str
    service_description: str
    invite_code: str


class OrgJoinSubmit(APIModel):
    cohort: str = Field(default="", max_length=120)
    org_consent_accepted: bool
    share_with_mentor: bool = False
    share_scope: str = Field(default="session", pattern=r"^(session|all)$")


class OrgConsentUpdate(APIModel):
    share_with_mentor: bool | None = None
    share_scope: str | None = Field(default=None, pattern=r"^(session|all)$")
    cohort: str | None = Field(default=None, max_length=120)


class OrgMembershipView(APIModel):
    org_id: str | None = None
    org_name: str = ""
    role: str | None = None
    consent: dict[str, Any] | None = None
    shared_session_ids: list[str] = Field(default_factory=list)
    workshops: list[dict[str, Any]] = Field(default_factory=list)


class OrgMentorAdd(APIModel):
    user_id: str = Field(min_length=8, max_length=64)


class OrgShareSession(APIModel):
    session_id: str = Field(min_length=8, max_length=64)
