import { useSearchParams } from 'react-router-dom'
import { ActivityLayout } from '@/features/activity/components/ActivityLayout'
import { ArtMain } from '@/features/activity/components/ArtMain'
import { GymnasticsMain } from '@/features/activity/components/GymnasticsMain'
import { MusicMain } from '@/features/activity/components/MusicMain'
import { SidebarPlaceholder } from '@/features/activity/components/SidebarPlaceholder'
import { TaekwondoMain } from '@/features/activity/components/TaekwondoMain'
import { HeaderBar } from '@/features/dashboard/components/HeaderBar'
import '@/features/dashboard/tokens.css'

export function ActivityPage() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab')

  let main
  if (tab === 'art') main = <ArtMain />
  else if (tab === 'taekwondo') main = <TaekwondoMain />
  else if (tab === 'gymnastics') main = <GymnasticsMain />
  else main = <MusicMain />

  return <ActivityLayout header={<HeaderBar />} sidebar={<SidebarPlaceholder />} main={main} />
}
