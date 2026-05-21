import comongImg from '@/assets/comong.png'
import comongChatImg from '@/assets/comong_chat.png'
import dainImg from '@/assets/dain.png'
import dainChatImg from '@/assets/dain_chat.png'
import gunbinImg from '@/assets/gunbin.png'
import gunbinChatImg from '@/assets/gunbin_chat.png'
import jeonghoImg from '@/assets/jeongho.png'
import jeonghoChatImg from '@/assets/jeongho_chat.png'
import sehyunImg from '@/assets/sehyun.png'
import sehyunChatImg from '@/assets/sehyun_chat.png'
import yeongchulImg from '@/assets/yeongchul.png'
import youngchulChatImg from '@/assets/youngchul_chat.png'

export type EmotionTone = 'calm' | 'tired' | 'worried'

export type ChatCharacter = {
  id: string
  name: string
  avatarUrl: string
  emotion: EmotionTone
  /** 사이드바 썸네일 세로 오프셋. 음수일수록 캐릭터를 위로 올림 (예: '-12%') */
  thumbOffsetY?: string
  /** 사이드바 썸네일 줌 배율. 클수록 클로즈업 (기본 1.25) */
  thumbScale?: string
  /** 메인 stage 우측에 표시할 채팅용 이미지 (없으면 avatarUrl 폴백) */
  chatImageUrl?: string
  /** 우측 이미지의 width 값. 클수록 줌인. 기본 260% */
  chatImageScale?: string
  /** 우측 이미지 가로 오프셋(중앙 기준, 음수=왼쪽). 예: '-8%' */
  chatImageOffsetX?: string
  /** 우측 이미지 세로 오프셋(상단 기준, 양수=아래로). 예: '12%' */
  chatImageOffsetY?: string
}

export type MessagePart = {
  text: string
  sentiment?: 'positive' | 'negative'
}

export type ChatMessage = {
  id: string
  speaker: 'character' | 'child'
  parts: MessagePart[]
}

export type EmotionTrendPoint = {
  label: string
  score: number
}

export type EmotionShare = {
  tone: EmotionTone
  label: string
  percent: number
}

export type EmotionSignal = {
  id: string
  tone: EmotionTone
  title: string
  description: string
}

export type ConversationSummary = {
  trustDelta: number
  topics: string[]
  recommendedActivity: string
}

export const CHARACTERS: ChatCharacter[] = [
  {
    id: 'yeongchul',
    name: '영철',
    avatarUrl: yeongchulImg,
    emotion: 'worried',
    thumbOffsetY: '-4%',
    thumbScale: '1.45',
    chatImageUrl: youngchulChatImg,
  },
  {
    id: 'comong',
    name: '코몽',
    avatarUrl: comongImg,
    emotion: 'calm',
    thumbOffsetY: '-10%',
    thumbScale: '1.5',
    chatImageUrl: comongChatImg,
    chatImageScale: '180%',
    chatImageOffsetX: '-3%',
    chatImageOffsetY: '14%',
  },
  {
    id: 'dain',
    name: '다인',
    avatarUrl: dainImg,
    emotion: 'tired',
    thumbOffsetY: '-6%',
    thumbScale: '1.5',
    chatImageUrl: dainChatImg,
    chatImageScale: '180%',
    chatImageOffsetX: '-3%',
    chatImageOffsetY: '10%',
  },
  {
    id: 'gunbin',
    name: '건빈',
    avatarUrl: gunbinImg,
    emotion: 'worried',
    thumbOffsetY: '-11%',
    thumbScale: '1.45',
    chatImageUrl: gunbinChatImg,
    chatImageScale: '180%',
    chatImageOffsetX: '-3%',
    chatImageOffsetY: '10%',
  },
  {
    id: 'jeongho',
    name: '정호',
    avatarUrl: jeonghoImg,
    emotion: 'calm',
    thumbOffsetY: '-6%',
    thumbScale: '1.5',
    chatImageUrl: jeonghoChatImg,
    chatImageScale: '180%',
    chatImageOffsetX: '-3%',
    chatImageOffsetY: '10%',
  },
  {
    id: 'sehyun',
    name: '세현',
    avatarUrl: sehyunImg,
    emotion: 'calm',
    thumbOffsetY: '-10%',
    thumbScale: '1.5',
    chatImageUrl: sehyunChatImg,
    chatImageScale: '160%',
    chatImageOffsetX: '-6%',
    chatImageOffsetY: '10%',
  },
]

export const SESSION_META = {
  characterId: 'yeongchul',
  whenLabel: '어제, 오후 7:20',
  durationLabel: '대화 완료 (10분)',
}

export const MESSAGES: ChatMessage[] = [
  { id: 'm1', speaker: 'character', parts: [{ text: '오늘 기분은 어땠어?' }] },
  {
    id: 'm2',
    speaker: 'child',
    parts: [
      { text: '주사 맞을 때 조금 ' },
      { text: '무서웠어', sentiment: 'negative' },
      { text: '.' },
    ],
  },
  { id: 'm3', speaker: 'character', parts: [{ text: '잘 참았어, 정말 씩씩하다!' }] },
  {
    id: 'm4',
    speaker: 'child',
    parts: [
      { text: '엄마가 옆에 같이 있어줘서 마음이 정말 ' },
      { text: '안심됐어', sentiment: 'positive' },
      { text: '.' },
    ],
  },
]

export const SUMMARY: ConversationSummary = {
  trustDelta: 12,
  topics: ['주사', '용기'],
  recommendedActivity: '용기 낸 순간을 칭찬하고 감정 일기로 함께 기록해보세요.',
}

export const TODAY_SCORE = 72

export const EMOTION_SHARES: EmotionShare[] = [
  { tone: 'calm', label: '안정', percent: 58 },
  { tone: 'tired', label: '피로', percent: 27 },
  { tone: 'worried', label: '걱정', percent: 15 },
]

export const EMOTION_TREND: EmotionTrendPoint[] = [
  { label: '시작', score: 45 },
  { label: '2분', score: 70 },
  { label: '4분', score: 80 },
  { label: '6분', score: 55 },
  { label: '8분', score: 60 },
  { label: '10분', score: 72 },
]

export const EMOTION_SIGNALS: EmotionSignal[] = [
  {
    id: 's1',
    tone: 'worried',
    title: '두려움 표현 있음',
    description: '주사 맞을 때 무서운 마음을 이야기했어요.',
  },
  {
    id: 's2',
    tone: 'calm',
    title: '대화 후반 안정됨',
    description: '부담이 줄어들어 안정되었어요.',
  },
  {
    id: 's3',
    tone: 'calm',
    title: '안심 표현 있음',
    description: '이야기 후 안심하는 모습을 보였어요.',
  },
]
