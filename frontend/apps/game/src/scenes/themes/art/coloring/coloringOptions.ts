import { assetPath } from '@/game/assets/assetPath'

export type ColoringOption = {
  id: string
  label: string
  assetKey: string
  imagePath: string
}

export const coloringOptions: ColoringOption[] = [
  {
    id: 'dain',
    label: '다인',
    assetKey: 'art-coloring-dain',
    imagePath: assetPath('images/themes/art/coloring/dain.png'),
  },
  {
    id: 'geonbin',
    label: '건빈',
    assetKey: 'art-coloring-geonbin',
    imagePath: assetPath('images/themes/art/coloring/geonbin.png'),
  },
  {
    id: 'gisung',
    label: '기성',
    assetKey: 'art-coloring-gisung',
    imagePath: assetPath('images/themes/art/coloring/gisung.png'),
  },
  {
    id: 'jeongho',
    label: '정호',
    assetKey: 'art-coloring-jeongho',
    imagePath: assetPath('images/themes/art/coloring/jeongho.png'),
  },
  {
    id: 'joeun',
    label: '조은',
    assetKey: 'art-coloring-joeun',
    imagePath: assetPath('images/themes/art/coloring/joeun.png'),
  },
  {
    id: 'kongmong',
    label: '콩몽',
    assetKey: 'art-coloring-kongmong',
    imagePath: assetPath('images/themes/art/coloring/kongmong.png'),
  },
  {
    id: 'rumi',
    label: '루미',
    assetKey: 'art-coloring-rumi',
    imagePath: assetPath('images/themes/art/coloring/rumi.png'),
  },
  {
    id: 'sehyun',
    label: '세현',
    assetKey: 'art-coloring-sehyun',
    imagePath: assetPath('images/themes/art/coloring/sehyun.png'),
  },
  {
    id: 'seokjae',
    label: '석재',
    assetKey: 'art-coloring-seokjae',
    imagePath: assetPath('images/themes/art/coloring/seokjae.png'),
  },
  {
    id: 'seongsu',
    label: '성수',
    assetKey: 'art-coloring-seongsu',
    imagePath: assetPath('images/themes/art/coloring/seongsu.png'),
  },
  {
    id: 'yeongcheol',
    label: '영철',
    assetKey: 'art-coloring-yeongcheol',
    imagePath: assetPath('images/themes/art/coloring/yeongcheol.png'),
  },
  {
    id: 'yeongchil',
    label: '영칠',
    assetKey: 'art-coloring-yeongchil',
    imagePath: assetPath('images/themes/art/coloring/yeongchil.png'),
  },
]

export function getColoringOption(id: string | undefined) {
  return coloringOptions.find(option => option.id === id) ?? coloringOptions[0]
}
