export const SHAPES = ['circle', 'triangle', 'square'] as const;
export const SHAPE_COLORS = ['coral', 'blue', 'violet'] as const;
export const BACKGROUND_COLORS = ['butter', 'mint', 'lilac'] as const;

export type Shape = (typeof SHAPES)[number];
export type ShapeColor = (typeof SHAPE_COLORS)[number];
export type BackgroundColor = (typeof BACKGROUND_COLORS)[number];

export interface Card {
  id: string;
  shape: Shape;
  shapeColor: ShapeColor;
  backgroundColor: BackgroundColor;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface PublicPlayer {
  id: string;
  nickname: string;
  score: number;
  isHost: boolean;
  penaltyUntil: number;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  status: RoomStatus;
  roundsTotal: number;
  roundNumber: number;
  claimSeconds: number;
  penaltySeconds: number;
  board: Card[];
  players: PublicPlayer[];
  claimantId: string | null;
  claimDeadline: number | null;
  message: string;
}

export function allCards(): Card[] {
  return SHAPES.flatMap((shape) =>
    SHAPE_COLORS.flatMap((shapeColor) =>
      BACKGROUND_COLORS.map((backgroundColor) => ({
        id: `${shape}-${shapeColor}-${backgroundColor}`,
        shape,
        shapeColor,
        backgroundColor,
      })),
    ),
  );
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function attributeIsSet(values: string[]): boolean {
  const unique = new Set(values).size;
  return unique === 1 || unique === values.length;
}

export function isValidCombination(cards: Card[]): boolean {
  if (cards.length !== 3 || new Set(cards.map((card) => card.id)).size !== 3) return false;
  return (
    attributeIsSet(cards.map((card) => card.shape)) &&
    attributeIsSet(cards.map((card) => card.shapeColor)) &&
    attributeIsSet(cards.map((card) => card.backgroundColor))
  );
}

export function findAnyCombination(board: Card[]): number[] | null {
  for (let i = 0; i < board.length - 2; i += 1) {
    for (let j = i + 1; j < board.length - 1; j += 1) {
      for (let k = j + 1; k < board.length; k += 1) {
        if (isValidCombination([board[i], board[j], board[k]])) return [i, j, k];
      }
    }
  }
  return null;
}

export function hasAnyCombination(board: Card[]): boolean {
  return findAnyCombination(board) !== null;
}

/**
 * Make a 9-card board that definitely starts with a valid combination. The
 * artwork and layout are original; the rule itself follows the game's public
 * description: each of the three attributes must be all equal or all distinct.
 */
export function createBoard(): Card[] {
  const catalog = allCards();
  const seed = [
    catalog.find((card) => card.shape === 'circle' && card.shapeColor === 'violet' && card.backgroundColor === 'lilac')!,
    catalog.find((card) => card.shape === 'triangle' && card.shapeColor === 'violet' && card.backgroundColor === 'lilac')!,
    catalog.find((card) => card.shape === 'square' && card.shapeColor === 'violet' && card.backgroundColor === 'lilac')!,
  ];
  const seedIds = new Set(seed.map((card) => card.id));
  const extras = shuffle(catalog.filter((card) => !seedIds.has(card.id))).slice(0, 6);
  return shuffle([...seed, ...extras]);
}

/** Remove the selected three and replace them with cards not already on board. */
export function replaceCombination(board: Card[], selectedIds: string[]): Card[] {
  const selected = new Set(selectedIds);
  const kept = board.filter((card) => !selected.has(card.id));
  if (selected.size !== 3 || board.length - kept.length !== 3) return board;
  const keptIds = new Set(kept.map((card) => card.id));
  const replacements = shuffle(allCards().filter((card) => !keptIds.has(card.id))).slice(0, 3);
  return shuffle([...kept, ...replacements]);
}
