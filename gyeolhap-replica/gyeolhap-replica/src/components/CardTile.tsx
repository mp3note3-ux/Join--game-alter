import type { Card } from '../shared/game';

interface CardTileProps {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  index?: number;
}

export function CardTile({ card, selected = false, disabled = false, onClick, index }: CardTileProps) {
  const shapeColor: Record<Card['shapeColor'], string> = {
    coral: '#e96368',
    blue: '#5478e8',
    violet: '#8660d7',
  };

  return (
    <button
      type="button"
      className={`playing-card bg-${card.backgroundColor}${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`카드 ${index === undefined ? '' : index + 1}: ${card.shape}, ${card.shapeColor}, ${card.backgroundColor}`}
      aria-pressed={selected}
    >
      <span className="card-corner" aria-hidden="true">✦</span>
      <svg className="card-symbol" viewBox="0 0 100 100" role="img" aria-hidden="true">
        {card.shape === 'circle' && <circle cx="50" cy="50" r="29" fill={shapeColor[card.shapeColor]} />}
        {card.shape === 'triangle' && <polygon points="50,17 83,78 17,78" fill={shapeColor[card.shapeColor]} strokeLinejoin="round" />}
        {card.shape === 'square' && <rect x="22" y="22" width="56" height="56" rx="7" fill={shapeColor[card.shapeColor]} />}
      </svg>
      <span className="card-bottom-dots" aria-hidden="true"><i /><i /><i /></span>
    </button>
  );
}
