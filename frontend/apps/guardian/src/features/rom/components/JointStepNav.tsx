import type { RomJointGroup, RomJointId } from '../data/model'
import styles from './JointStepNav.module.css'

type Props = {
  items: ReadonlyArray<Pick<RomJointGroup, 'id' | 'name' | 'step'>>
  activeId: RomJointId
  onSelect: (id: RomJointId) => void
}

export function JointStepNav({ items, activeId, onSelect }: Props) {
  return (
    <nav className={styles.nav} aria-label="관절 선택">
      <ul className={styles.list}>
        {items.map((joint, idx) => {
          const isActive = joint.id === activeId
          const isLast = idx === items.length - 1
          return (
            <li key={joint.id} className={styles.itemWrap}>
              <button
                type="button"
                className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                onClick={() => onSelect(joint.id)}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className={styles.itemNum}>{joint.step}</span>
                <span className={styles.itemBody}>
                  <span className={styles.itemLabel}>{joint.name}</span>
                  {isActive && <span className={styles.itemMeta}>현재 보기</span>}
                </span>
              </button>
              {!isLast && <span className={styles.connector} aria-hidden />}
            </li>
          )
        })}
      </ul>
      <span className={styles.tailConnector} aria-hidden />
      <div className={styles.scrollHint} aria-hidden>
        <span className={styles.scrollArrow}>↓</span>
        <span className={styles.scrollText}>
          아래로 스크롤하면
          <br />
          다음 관절을 볼 수 있어요
        </span>
      </div>
    </nav>
  )
}
