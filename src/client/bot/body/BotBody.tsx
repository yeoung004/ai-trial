/** One continuous pixel silhouette, with a die-cut sticker border. */
export function BotBody() {
  return (
    <path
      className="bot-silhouette"
      d="M28 28H132V56H145V94H132V156H116V126H104V156H92V132H68V156H56V126H44V156H28V94H15V56H28Z"
      fill="#D77756"
      stroke="#FFFFFF"
      strokeWidth="7"
      strokeLinejoin="round"
      paintOrder="stroke fill"
    />
  );
}

/** The shadow stays on the floor while the sticker jumps. */
export function BotShadow() {
  return (
    <ellipse
      className="bot-shadow"
      cx="80"
      cy="166"
      rx="48"
      ry="6"
      fill="#79533B"
      opacity=".18"
    />
  );
}
