import type { CSSProperties } from 'react'
import fuelCardUrl from '@/assets/fuel_card.png'
import styles from './ChildPreviewCard.module.css'

export function ChildPreviewCard() {
  const cardStyle: CSSProperties = {
    ['--fuel-card-bg' as string]: `url(${fuelCardUrl})`,
  }

  return (
    <section className={styles.card}>
      <div className={styles.header}>별빛 에너지란?</div>

      <div className={styles.preview} style={cardStyle}>
        <div className={styles.previewOverlay} />
        <div className={styles.previewContent}>
          <h3 className={styles.previewTitle}>응원으로 채우는 별빛 에너지</h3>
          <ul className={styles.previewList}>
            <li>아이의 치료 진행에 맞춰 별빛을 보내주세요.</li>
            <li>응원 메시지도 함께 전달돼요.</li>
            <li>
              <strong>100%</strong>가 되면 아이의 치료 여정이 완성돼요.
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
