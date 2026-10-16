export function BotFace({ speaking = false }: { speaking?: boolean }) {
  return (
    <g>
      <g className="bot-eyes" fill="#17120F">
        <rect x="46" y="58" width="13" height="15" />
        <rect x="101" y="58" width="13" height="15" />
      </g>
      {speaking && (
        <rect
          className="bot-mouth"
          x="75"
          y="85"
          width="10"
          height="6"
          fill="#17120F"
        />
      )}
    </g>
  );
}
