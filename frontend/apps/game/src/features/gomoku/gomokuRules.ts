export const GOMOKU_BOARD_SIZE = 15

export type Stone = 'black' | 'white'
export type Cell = Stone | null
export type Board = Cell[][]
export type RuleSet = 'freestyle' | 'renju-lite'
export type ComputerLevel = 'beginner' | 'intermediate' | 'advanced'
export type PlayerSource = 'human' | 'computer'

export type Position = {
  row: number
  col: number
}

export type GomokuMove = {
  position: Position
  stone: Stone
  source: PlayerSource
}

export type GameStatus =
  | {
      phase: 'playing'
      winner?: undefined
      winningLine?: undefined
      reason?: undefined
    }
  | {
      phase: 'won'
      winner: Stone
      winningLine: Position[]
      reason: 'five' | 'timeout'
    }
  | {
      phase: 'draw'
      winner?: undefined
      winningLine?: undefined
      reason: 'board-full'
    }

export type ForbiddenMove = {
  type: 'overline' | 'double-three' | 'double-four'
  message: string
}

export type ComputerChoiceOptions = {
  random?: () => number
}

const DIRECTIONS = [
  { dRow: 0, dCol: 1 },
  { dRow: 1, dCol: 0 },
  { dRow: 1, dCol: 1 },
  { dRow: 1, dCol: -1 },
] as const

const FORBIDDEN_MESSAGES: Record<ForbiddenMove['type'], string> = {
  overline: '\uD751\uC740 6\uBAA9 \uC774\uC0C1\uC744 \uB193\uC744 \uC218 \uC5C6\uC5B4\uC694.',
  'double-three': '\uD751\uC740 3-3 \uAE08\uC218\uC785\uB2C8\uB2E4.',
  'double-four': '\uD751\uC740 4-4 \uAE08\uC218\uC785\uB2C8\uB2E4.',
}
const OPEN_THREE_PATTERNS = ['.XXX.', '.XX.X.', '.X.XX.'] as const
const DIRECTIONAL_PATTERN_RADIUS = 5

export function createEmptyBoard(size = GOMOKU_BOARD_SIZE): Board {
  return Array.from({ length: size }, () => Array<Cell>(size).fill(null))
}

export function cloneBoard(board: Board): Board {
  return board.map(row => [...row])
}

export function opponentOf(stone: Stone): Stone {
  return stone === 'black' ? 'white' : 'black'
}

export function isInsideBoard(board: Board, position: Position) {
  return (
    position.row >= 0 &&
    position.col >= 0 &&
    position.row < board.length &&
    position.col < board.length
  )
}

export function applyMove(board: Board, position: Position, stone: Stone): Board {
  if (!isInsideBoard(board, position)) {
    throw new Error('Position is outside the board.')
  }
  if (board[position.row][position.col]) {
    throw new Error('Position is already occupied.')
  }

  const nextBoard = cloneBoard(board)
  nextBoard[position.row][position.col] = stone
  return nextBoard
}

export function buildBoardFromMoves(moves: GomokuMove[], size = GOMOKU_BOARD_SIZE): Board {
  return moves.reduce(
    (board, move) => applyMove(board, move.position, move.stone),
    createEmptyBoard(size),
  )
}

export function deriveStatusFromMoves(
  moves: GomokuMove[],
  ruleSet: RuleSet,
  size = GOMOKU_BOARD_SIZE,
): { board: Board; status: GameStatus } {
  let board = createEmptyBoard(size)
  let status: GameStatus = { phase: 'playing' }

  for (const move of moves) {
    board = applyMove(board, move.position, move.stone)
    status = getGameStatus(board, move.position, ruleSet)
    if (status.phase !== 'playing') {
      return { board, status }
    }
  }

  return { board, status }
}

export function getGameStatus(
  board: Board,
  lastMove: Position | null,
  ruleSet: RuleSet,
): GameStatus {
  if (lastMove) {
    const stone = board[lastMove.row]?.[lastMove.col]
    if (stone) {
      const winningLine = getWinningLine(board, lastMove, stone, ruleSet)
      if (winningLine) {
        return {
          phase: 'won',
          winner: stone,
          winningLine,
          reason: 'five',
        }
      }
    }
  }

  if (getAvailableMoves(board).length === 0) {
    return { phase: 'draw', reason: 'board-full' }
  }

  return { phase: 'playing' }
}

export function detectForbiddenMove(
  board: Board,
  position: Position,
  stone: Stone,
  ruleSet: RuleSet,
): ForbiddenMove | null {
  if (ruleSet !== 'renju-lite' || stone !== 'black') return null
  if (!isInsideBoard(board, position) || board[position.row][position.col]) return null

  const nextBoard = applyMove(board, position, stone)
  const maxLine = Math.max(
    ...DIRECTIONS.map(direction => getLine(nextBoard, position, stone, direction).length),
  )
  if (maxLine > 5) {
    return { type: 'overline', message: FORBIDDEN_MESSAGES.overline }
  }

  if (getGameStatus(nextBoard, position, ruleSet).phase === 'won') {
    return null
  }

  const openThrees = DIRECTIONS.filter(direction =>
    hasOpenThree(nextBoard, position, stone, direction),
  ).length
  if (openThrees >= 2) {
    return { type: 'double-three', message: FORBIDDEN_MESSAGES['double-three'] }
  }

  const fours = DIRECTIONS.filter(direction =>
    hasFourThreat(nextBoard, position, stone, direction),
  ).length
  if (fours >= 2) {
    return { type: 'double-four', message: FORBIDDEN_MESSAGES['double-four'] }
  }

  return null
}

export function getAvailableMoves(board: Board): Position[] {
  const moves: Position[] = []

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      if (!board[row][col]) {
        moves.push({ row, col })
      }
    }
  }

  return moves
}

export function chooseComputerMove(
  board: Board,
  level: ComputerLevel,
  computerStone: Stone,
  ruleSet: RuleSet,
  options: ComputerChoiceOptions = {},
): Position | null {
  const random = options.random ?? Math.random
  const candidates = getCandidateMoves(board)

  if (candidates.length === 0) return null

  if (level === 'beginner') {
    const center = getCenterPosition(board)
    const nearbyCandidates = candidates.filter(
      candidate => distanceSquared(candidate, center) <= 32,
    )
    const pool = nearbyCandidates.length > 0 ? nearbyCandidates : candidates
    return pool[Math.floor(random() * pool.length)]
  }

  const opponent = opponentOf(computerStone)
  const immediateWin = findImmediateWinningMove(board, candidates, computerStone, ruleSet)
  if (immediateWin) return immediateWin

  const immediateBlock = findImmediateWinningMove(board, candidates, opponent, ruleSet)
  if (immediateBlock) return immediateBlock

  const ranked = candidates
    .map(position => ({
      position,
      score:
        level === 'advanced'
          ? scoreAdvancedMove(board, position, computerStone, ruleSet)
          : scoreIntermediateMove(board, position, computerStone, ruleSet),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        distanceSquared(a.position, getCenterPosition(board)) -
          distanceSquared(b.position, getCenterPosition(board)),
    )

  return ranked[0]?.position ?? null
}

export function isSamePosition(a: Position | null | undefined, b: Position | null | undefined) {
  return Boolean(a && b && a.row === b.row && a.col === b.col)
}

function getWinningLine(board: Board, lastMove: Position, stone: Stone, ruleSet: RuleSet) {
  for (const direction of DIRECTIONS) {
    const line = getLine(board, lastMove, stone, direction)
    const blackMustBeExactFive = ruleSet === 'renju-lite' && stone === 'black'
    if (blackMustBeExactFive ? line.length === 5 : line.length >= 5) {
      return line.slice(0, 5)
    }
  }

  return null
}

function getLine(
  board: Board,
  origin: Position,
  stone: Stone,
  direction: (typeof DIRECTIONS)[number],
) {
  const forward = collectDirection(board, origin, stone, direction.dRow, direction.dCol)
  const backward = collectDirection(board, origin, stone, -direction.dRow, -direction.dCol)
  return [...backward.reverse(), origin, ...forward]
}

function collectDirection(
  board: Board,
  origin: Position,
  stone: Stone,
  dRow: number,
  dCol: number,
) {
  const positions: Position[] = []
  let row = origin.row + dRow
  let col = origin.col + dCol

  while (isInsideBoard(board, { row, col }) && board[row][col] === stone) {
    positions.push({ row, col })
    row += dRow
    col += dCol
  }

  return positions
}

function hasOpenThree(
  board: Board,
  origin: Position,
  stone: Stone,
  direction: (typeof DIRECTIONS)[number],
) {
  if (hasFourThreat(board, origin, stone, direction)) {
    return false
  }

  const line = getDirectionalPattern(board, origin, stone, direction)
  const centerIndex = DIRECTIONAL_PATTERN_RADIUS

  return OPEN_THREE_PATTERNS.some(pattern => containsPatternAtOrigin(line, centerIndex, pattern))
}

function hasFourThreat(
  board: Board,
  origin: Position,
  stone: Stone,
  direction: (typeof DIRECTIONS)[number],
) {
  for (let offset = -4; offset <= 4; offset += 1) {
    if (offset === 0) continue

    const candidate = {
      row: origin.row + direction.dRow * offset,
      col: origin.col + direction.dCol * offset,
    }
    if (!isInsideBoard(board, candidate) || board[candidate.row][candidate.col]) continue

    const nextBoard = applyMove(board, candidate, stone)
    const lineLength =
      collectDirection(nextBoard, candidate, stone, direction.dRow, direction.dCol).length +
      collectDirection(nextBoard, candidate, stone, -direction.dRow, -direction.dCol).length +
      1
    if (lineLength === 5) return true
  }

  return false
}

function getDirectionalPattern(
  board: Board,
  origin: Position,
  stone: Stone,
  direction: (typeof DIRECTIONS)[number],
) {
  let pattern = ''

  for (
    let offset = -DIRECTIONAL_PATTERN_RADIUS;
    offset <= DIRECTIONAL_PATTERN_RADIUS;
    offset += 1
  ) {
    const row = origin.row + direction.dRow * offset
    const col = origin.col + direction.dCol * offset
    const position = { row, col }
    if (!isInsideBoard(board, position)) {
      pattern += '#'
    } else if (board[row][col] === null) {
      pattern += '.'
    } else {
      pattern += board[row][col] === stone ? 'X' : '#'
    }
  }

  return pattern
}

function containsPatternAtOrigin(line: string, centerIndex: number, pattern: string) {
  for (let start = 0; start <= line.length - pattern.length; start += 1) {
    const end = start + pattern.length
    if (centerIndex < start || centerIndex >= end) continue
    if (line.slice(start, end) === pattern) return true
  }

  return false
}

function getCandidateMoves(board: Board) {
  const occupied: Position[] = []

  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board.length; col += 1) {
      if (board[row][col]) {
        occupied.push({ row, col })
      }
    }
  }

  if (occupied.length === 0) {
    return [getCenterPosition(board)]
  }

  const candidates = new Map<string, Position>()
  for (const stone of occupied) {
    for (let dRow = -2; dRow <= 2; dRow += 1) {
      for (let dCol = -2; dCol <= 2; dCol += 1) {
        const position = { row: stone.row + dRow, col: stone.col + dCol }
        if (!isInsideBoard(board, position) || board[position.row][position.col]) continue
        candidates.set(`${position.row}:${position.col}`, position)
      }
    }
  }

  return [...candidates.values()]
}

function findImmediateWinningMove(
  board: Board,
  candidates: Position[],
  stone: Stone,
  ruleSet: RuleSet,
) {
  return candidates.find(candidate => {
    if (detectForbiddenMove(board, candidate, stone, ruleSet)) return false
    const nextBoard = applyMove(board, candidate, stone)
    return getGameStatus(nextBoard, candidate, ruleSet).phase === 'won'
  })
}

function scoreIntermediateMove(
  board: Board,
  position: Position,
  computerStone: Stone,
  ruleSet: RuleSet,
) {
  if (detectForbiddenMove(board, position, computerStone, ruleSet)) return Number.NEGATIVE_INFINITY

  const opponent = opponentOf(computerStone)
  const offense = scoreMoveShape(board, position, computerStone)
  const defense = board[position.row][position.col]
    ? 0
    : scoreMoveShape(board, position, opponent) * 0.86

  return offense + defense + centerBias(board, position)
}

function scoreAdvancedMove(
  board: Board,
  position: Position,
  computerStone: Stone,
  ruleSet: RuleSet,
) {
  if (detectForbiddenMove(board, position, computerStone, ruleSet)) return Number.NEGATIVE_INFINITY

  const opponent = opponentOf(computerStone)
  const nextBoard = applyMove(board, position, computerStone)
  const opponentCandidates = getCandidateMoves(nextBoard)
  const opponentBestReply = Math.max(
    0,
    ...opponentCandidates.map(candidate => scoreMoveShape(nextBoard, candidate, opponent)),
  )
  const forkBonus = countPromisingLines(nextBoard, position, computerStone) >= 2 ? 26_000 : 0

  return (
    scoreMoveShape(board, position, computerStone) * 1.08 +
    scoreMoveShape(board, position, opponent) * 0.96 +
    forkBonus +
    centerBias(board, position) -
    opponentBestReply * 0.42
  )
}

function scoreMoveShape(board: Board, position: Position, stone: Stone) {
  if (board[position.row][position.col]) return 0

  const nextBoard = applyMove(board, position, stone)
  return DIRECTIONS.reduce((score, direction) => {
    const forward = collectDirection(nextBoard, position, stone, direction.dRow, direction.dCol)
    const backward = collectDirection(nextBoard, position, stone, -direction.dRow, -direction.dCol)
    const length = forward.length + backward.length + 1
    const openEnds = countOpenEnds(
      nextBoard,
      position,
      stone,
      direction,
      forward.length,
      backward.length,
    )

    if (length >= 5) return score + 1_000_000
    if (length === 4 && openEnds === 2) return score + 140_000
    if (length === 4 && openEnds === 1) return score + 62_000
    if (length === 3 && openEnds === 2) return score + 18_000
    if (length === 3 && openEnds === 1) return score + 5_400
    if (length === 2 && openEnds === 2) return score + 1_300
    if (length === 2 && openEnds === 1) return score + 420
    return score + openEnds * 55 + length * 18
  }, 0)
}

function countPromisingLines(board: Board, position: Position, stone: Stone) {
  return DIRECTIONS.filter(direction => {
    const forward = collectDirection(board, position, stone, direction.dRow, direction.dCol)
    const backward = collectDirection(board, position, stone, -direction.dRow, -direction.dCol)
    const length = forward.length + backward.length + 1
    const openEnds = countOpenEnds(
      board,
      position,
      stone,
      direction,
      forward.length,
      backward.length,
    )
    return length >= 3 && openEnds > 0
  }).length
}

function countOpenEnds(
  board: Board,
  origin: Position,
  _stone: Stone,
  direction: (typeof DIRECTIONS)[number],
  forwardLength: number,
  backwardLength: number,
) {
  const before = {
    row: origin.row - direction.dRow * (backwardLength + 1),
    col: origin.col - direction.dCol * (backwardLength + 1),
  }
  const after = {
    row: origin.row + direction.dRow * (forwardLength + 1),
    col: origin.col + direction.dCol * (forwardLength + 1),
  }

  return (
    Number(isInsideBoard(board, before) && board[before.row][before.col] === null) +
    Number(isInsideBoard(board, after) && board[after.row][after.col] === null)
  )
}

function getCenterPosition(board: Board): Position {
  const center = Math.floor(board.length / 2)
  return { row: center, col: center }
}

function centerBias(board: Board, position: Position) {
  const center = getCenterPosition(board)
  return Math.max(0, 80 - distanceSquared(position, center) * 2)
}

function distanceSquared(a: Position, b: Position) {
  const dRow = a.row - b.row
  const dCol = a.col - b.col
  return dRow * dRow + dCol * dCol
}
