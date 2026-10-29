// All scenes share these painterly layers; only their enclosing stage moves.
export default function Bottle({ className = "" }: { className?: string }) {
  return (
    <div className={`bottle ${className}`} aria-hidden="true">
      <img className="bottle-cork" src="/art/bottle-cork.webp" alt="" width="120" height="140" />
      <img className="bottle-glass" src="/art/bottle-glass.webp" alt="" width="360" height="720" />
      <img className="bottle-note" src="/art/bottle-note.webp" alt="" width="100" height="300" />
    </div>
  );
}
