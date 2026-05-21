export type FlagLabel = {
  label: string
  description: string
}

const FLAG_LABELS: Record<string, FlagLabel> = {
  agency_coping: { label: '주도적 대처', description: '스스로 해보려는 모습을 보였어요.' },
  alternative_expression: {
    label: '다른 방식 표현',
    description: '말 대신 다른 방법으로 표현했어요.',
  },
  anger_or_frustration: { label: '분노·답답함', description: '화나거나 답답한 마음을 비췄어요.' },
  body_discomfort: { label: '몸 불편함', description: '몸이 불편하다고 이야기했어요.' },
  body_state_named: { label: '몸 상태 표현', description: '몸 상태를 말로 표현했어요.' },
  breathing_coping: {
    label: '호흡으로 진정',
    description: '숨을 고르며 마음을 가다듬으려 했어요.',
  },
  calm_state_named: { label: '안정 표현', description: '안정된 마음을 표현했어요.' },
  can_name_fear: { label: '두려움 표현', description: '무서운 마음을 말로 꺼냈어요.' },
  creative_expression: { label: '창의적 표현', description: '그림·놀이로 마음을 풀어냈어요.' },
  emotion_named: { label: '감정 이름 붙임', description: '자기 감정을 또렷이 이름 붙였어요.' },
  empathy: { label: '공감', description: '다른 사람의 마음에 공감했어요.' },
  family_support_preference: {
    label: '가족과 상의',
    description: '가족에게 도움을 청하고 싶어 해요.',
  },
  family_worry: { label: '가족 걱정', description: '가족 일로 걱정되는 마음을 비췄어요.' },
  fatigue_high: { label: '심한 피로', description: '많이 지친 상태예요.' },
  fatigue_present: { label: '피로감', description: '피곤한 마음을 표현했어요.' },
  hesitation_to_share: { label: '말하기 망설임', description: '이야기를 꺼내기 망설였어요.' },
  loneliness: { label: '외로움', description: '외로운 마음을 비췄어요.' },
  medical_support_preference: { label: '의료진과 상의', description: '선생님께 말하고 싶어 해요.' },
  needs_connection: { label: '연결 필요', description: '곁에 있어줄 누군가가 필요해 보여요.' },
  needs_rest: { label: '쉼이 필요', description: '잠시 쉴 시간이 필요해요.' },
  pain_concern: { label: '통증 걱정', description: '아픈 게 걱정된다고 했어요.' },
  parent_concern: { label: '부모 걱정', description: '부모님에 대한 걱정을 나눴어요.' },
  pause_coping: { label: '잠시 멈춤', description: '잠깐 멈춰서 마음을 정리했어요.' },
  peer_separation: { label: '또래와 분리', description: '친구들과 떨어진 점이 마음에 남았어요.' },
  playful_coping: { label: '놀이로 풀기', description: '놀이로 마음을 풀어보려 했어요.' },
  positive_activity: { label: '즐거운 활동', description: '즐거웠던 활동을 떠올렸어요.' },
  positive_body_state: { label: '좋은 컨디션', description: '몸 상태가 괜찮다고 했어요.' },
  positive_memory: { label: '좋은 기억', description: '좋았던 순간을 떠올렸어요.' },
  positive_social_state: { label: '좋은 관계', description: '주변과 잘 지내고 있다고 느꼈어요.' },
  prefers_nonverbal_expression: {
    label: '비언어 표현 선호',
    description: '말 대신 가리키거나 그림으로 표현하고 싶어 해요.',
  },
  procedure_fear: { label: '시술 두려움', description: '시술이 무섭다는 마음을 비췄어요.' },
  relationship_named: { label: '관계 표현', description: '주변 사람을 또렷이 떠올렸어요.' },
  rest_need_named: { label: '쉼 요청', description: '쉬고 싶다고 말로 표현했어요.' },
  self_care_action: { label: '자기 돌봄', description: '스스로를 돌보는 행동을 골랐어요.' },
  self_regulation: { label: '자기 조절', description: '스스로 마음을 가다듬으려 했어요.' },
  sets_boundary: { label: '경계 표현', description: '필요한 만큼만 하겠다고 말했어요.' },
  sleep_worry: { label: '수면 걱정', description: '잠에 대한 걱정을 나눴어요.' },
  social_connection: { label: '사회적 연결', description: '누군가와 함께하고 싶어 해요.' },
  support_need_named: {
    label: '도움 요청 표현',
    description: '도움이 필요하다고 말로 표현했어요.',
  },
  support_seeking: { label: '도움 찾기', description: '주변에 도움을 청하려 했어요.' },
  uncertainty: { label: '불확실함', description: '잘 모르겠다는 마음을 비췄어요.' },
  uncertainty_named: { label: '모호함 표현', description: '잘 모르겠다고 말로 표현했어요.' },
  verbal_expression: { label: '말로 표현', description: '마음을 말로 또렷이 표현했어요.' },
  worry_present: { label: '걱정 있음', description: '걱정되는 마음을 비췄어요.' },
}

function humanize(flag: string): string {
  return flag
    .split('_')
    .map(w => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

export function getFlagLabel(flag: string): FlagLabel {
  return FLAG_LABELS[flag] ?? { label: humanize(flag), description: '' }
}
