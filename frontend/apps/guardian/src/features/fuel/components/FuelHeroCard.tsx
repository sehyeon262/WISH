import type { CSSProperties } from 'react'
import fuelBgUrl from '@/assets/fuel__background.png'
import {
  FUEL_GOAL_PERCENT,
  FUEL_OPTIONS,
  MESSAGE_MAX_LENGTH,
  type FuelOptionId,
} from '../data/mock'
import { CheckIcon, SparklesIcon, StarIcon } from './icons'
import styles from './FuelHeroCard.module.css'

type Props = {
  currentPercent: number
  selectedId: FuelOptionId
  onSelect: (id: FuelOptionId) => void
  customAmount: string
  onCustomAmountChange: (value: string) => void
  message: string
  onMessageChange: (value: string) => void
  resolvedAmount: number
  onSend: () => void
  isSending?: boolean
}

export function FuelHeroCard({
  currentPercent,
  selectedId,
  onSelect,
  customAmount,
  onCustomAmountChange,
  message,
  onMessageChange,
  resolvedAmount,
  onSend,
  isSending = false,
}: Props) {
  const isFull = currentPercent >= FUEL_GOAL_PERCENT
  const canSend = !isFull && !isSending && resolvedAmount > 0 && message.trim().length > 0

  const handleSend = () => {
    if (!canSend) return
    onSend()
  }

  const heroStyle: CSSProperties = {
    ['--fuel-hero-bg' as string]: `url(${fuelBgUrl})`,
    ['--fuel-progress' as string]: `${currentPercent}%`,
  }

  return (
    <section className={styles.card} style={heroStyle}>
      <div className={styles.hero}>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <div>
            <span className={styles.heroLabel}>
              <SparklesIcon className={styles.heroLabelStar} />
              별빛 에너지
            </span>
            <div className={styles.heroBigPercent}>
              {currentPercent}
              <span>%</span>
            </div>
            <div className={styles.heroSubtitle}>
              새로운 출발까지 <strong>{Math.max(0, FUEL_GOAL_PERCENT - currentPercent)}%</strong>{' '}
              남았어요
            </div>
            <div className={styles.heroDesc}>아이의 치료 여정을 응원으로 채워주세요.</div>
          </div>

          <div className={styles.heroProgress}>
            <span className={styles.heroProgressLabel}>{currentPercent}%</span>
            <div className={styles.heroProgressBar}>
              <div className={styles.heroProgressFill} />
            </div>
            <span className={styles.heroProgressGoal}>{FUEL_GOAL_PERCENT}%</span>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <div>
          <div className={styles.sectionLabel}>에너지 선택</div>
          <div className={styles.optionGrid}>
            {FUEL_OPTIONS.map(option => {
              const isActive = option.id === selectedId
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.option} ${isActive ? styles.optionActive : ''}`}
                  onClick={() => onSelect(option.id)}
                >
                  <span className={styles.optionStar}>
                    <StarIcon color={option.starColor} />
                  </span>
                  <span className={styles.optionMeta}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.amount !== null ? (
                      <span className={styles.optionAmount}>+{option.amount}%</span>
                    ) : (
                      <span className={styles.customInputWrap}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={100}
                          value={customAmount}
                          placeholder="1~100"
                          className={styles.customInput}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            onSelect('custom')
                            onCustomAmountChange(e.target.value)
                          }}
                        />
                        <span className={styles.customSuffix}>%</span>
                      </span>
                    )}
                  </span>
                  {isActive && (
                    <span className={styles.optionCheck} aria-hidden>
                      <CheckIcon />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className={styles.sectionLabel}>아이에게 보낼 말</div>
          <div className={styles.messageRow}>
            <div className={styles.messageBox}>
              <textarea
                className={styles.messageInput}
                value={message}
                onChange={e => onMessageChange(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
                placeholder="아이에게 응원 메시지를 보내보세요"
              />
              <div className={styles.messageMeta}>
                <span>
                  {message.length} / {MESSAGE_MAX_LENGTH}
                </span>
              </div>
            </div>
            <div className={styles.sendColumn}>
              <button
                type="button"
                className={styles.sendButton}
                onClick={handleSend}
                disabled={!canSend}
              >
                <StarIcon color="#ffd55c" width={20} height={20} />
                {isSending ? '보내는 중...' : '별빛 에너지 보내기'}
              </button>
              <div className={styles.sendCaption}>
                {isFull ? '에너지가 가득 찼어요!' : '보내면 아이에게 응원 메시지가 전달돼요.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
