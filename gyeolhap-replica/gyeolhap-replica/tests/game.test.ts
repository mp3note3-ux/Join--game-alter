import { describe, expect, it } from 'vitest';
import { allCards, createBoard, hasAnyCombination, isValidCombination, replaceCombination } from '../src/shared/game';

const pick = (shape: string, shapeColor: string, backgroundColor: string) =>
  allCards().find((card) => card.shape === shape && card.shapeColor === shapeColor && card.backgroundColor === backgroundColor)!;

describe('combination rules', () => {
  it('rejects picking the same physical card three times', () => {
    expect(isValidCombination([
      pick('circle', 'coral', 'butter'),
      pick('circle', 'coral', 'butter'),
      pick('circle', 'coral', 'butter'),
    ])).toBe(false); // physical cards must be distinct
  });

  it('accepts each attribute when it is all equal or all different', () => {
    expect(isValidCombination([
      pick('circle', 'violet', 'lilac'),
      pick('triangle', 'violet', 'lilac'),
      pick('square', 'violet', 'lilac'),
    ])).toBe(true);
    expect(isValidCombination([
      pick('circle', 'coral', 'butter'),
      pick('triangle', 'blue', 'mint'),
      pick('square', 'violet', 'lilac'),
    ])).toBe(true);
  });

  it('rejects two-equal-and-one-different attribute values', () => {
    expect(isValidCombination([
      pick('circle', 'coral', 'butter'),
      pick('circle', 'blue', 'mint'),
      pick('square', 'violet', 'lilac'),
    ])).toBe(false);
  });

  it('creates nine unique cards with at least one valid combination', () => {
    for (let i = 0; i < 20; i += 1) {
      const board = createBoard();
      expect(board).toHaveLength(9);
      expect(new Set(board.map((card) => card.id)).size).toBe(9);
      expect(hasAnyCombination(board)).toBe(true);
    }
  });

  it('replaces the chosen three while keeping nine unique cards', () => {
    const board = createBoard();
    const selected = board.slice(0, 3).map((card) => card.id);
    const next = replaceCombination(board, selected);
    expect(next).toHaveLength(9);
    expect(new Set(next.map((card) => card.id)).size).toBe(9);
    expect(next.filter((card) => selected.includes(card.id))).toHaveLength(0);
  });
});
