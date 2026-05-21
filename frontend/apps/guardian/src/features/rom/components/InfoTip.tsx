import { InfoIcon } from '@/features/dashboard/components/icons'
import styles from './InfoTip.module.css'

type Props = {
  tip: string
}

export function InfoTip({ tip }: Props) {
  return (
    <span className={styles.wrap} tabIndex={0} role="button" aria-label="설명 보기">
      <InfoIcon className={styles.icon} />
      <span className={styles.tooltip} role="tooltip">
        {tip}
      </span>
    </span>
  )
}
