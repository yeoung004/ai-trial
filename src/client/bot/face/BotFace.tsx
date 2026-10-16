export function BotFace({ speaking = false }: { speaking?: boolean }) {
  return (
    <g>
      <g className="bot-eyes" fill="#4E392C">
        <rect x="56" y="53" width="9" height="16" rx="4.5" />
        <rect x="95" y="53" width="9" height="16" rx="4.5" />
      </g>
      <ellipse cx="49" cy="73" rx="6" ry="3" fill="#E5AE8C" />
      <ellipse cx="111" cy="73" rx="6" ry="3" fill="#E5AE8C" />
      {speaking ? (
        <ellipse
          className="bot-mouth"
          cx="80"
          cy="73"
          rx="5"
          ry="4"
          fill="#4E392C"
        />
      ) : (
        <path
          d="M75 72Q80 78 85 72"
          stroke="#4E392C"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </g>
  );
}
