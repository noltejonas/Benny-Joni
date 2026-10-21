/* global React, PTOnboarding */
// Benny und Joni als 3D-Comicfiguren. Bilder und Maße: www/figures
// (tools/cut-figures.py). Alle Posen liegen übereinander und sind vorgeladen,
// ein Wechsel blendet nur um und „ploppt“ die neue Pose ein. Die Bewegung pro
// Pose (atmen, wippen, pumpen, springen) kommt aus onboarding.css.

const OB_FIG_POSES = ['idle', 'wave', 'flex', 'cheer', 'point'];

// Eine Figur, Füße auf der Unterkante. `tall` = Bennys Körperhöhe in px,
// Joni wird daraus mit 170 zu 190 cm berechnet. Mit `tap` zeigt Antippen kurz den Bizeps.
function ObFigure({ who, pose = 'idle', tall = 160, tap = false, enter = false, className = '' }) {
  const set = (window.PTFigures || {})[who] || {};
  const [burst, setBurst] = React.useState(false);
  const timer = React.useRef();
  React.useEffect(() => () => clearTimeout(timer.current), []);

  const shown = burst && set.flex ? 'flex' : (set[pose] ? pose : 'idle');
  const idle = PTOnboarding.figureLayout(set.idle, who, tall);
  if (!idle) return null;
  const name = PTOnboarding.FIGURES[who].name;

  function onTap() {
    window.PTHaptics?.tap();
    setBurst(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBurst(false), 1700);
  }

  const Tag = tap ? 'button' : 'span';
  return (
    <Tag type={tap ? 'button' : undefined} onClick={tap ? onTap : undefined}
      className={`ob-fig is-${who}${enter ? ' is-enter' : ''} ${className}`} data-pose={shown}
      style={{ width: idle.width, height: idle.body, '--ob-fig-h': `${idle.body}px` }}
      aria-label={tap ? `${name} antippen` : name} role={tap ? undefined : 'img'}>
      <span className="ob-fig-shadow" aria-hidden="true" />
      <span className="ob-fig-in" aria-hidden="true">
        <span className="ob-fig-body">
          {OB_FIG_POSES.filter(p => set[p]).map(p => {
            const l = PTOnboarding.figureLayout(set[p], who, tall);
            return (
              <img key={p} src={set[p].src} alt="" draggable="false" decoding="async"
                className={`ob-fig-img${p === shown ? ' is-on' : ''}`}
                style={{ width: l.width, height: l.height, marginLeft: l.left, bottom: l.bottom }} />
            );
          })}
        </span>
      </span>
    </Tag>
  );
}

// Beide nebeneinander auf einer Linie, Benny links.
function ObDuo({ benny = 'idle', joni = 'idle', tall = 160, tap = false, enter = false, className = '' }) {
  return (
    <div className={`ob-duo ${className}`} role={tap ? 'group' : 'img'} aria-label="Benny und Joni">
      <ObFigure who="benny" pose={benny} tall={tall} tap={tap} enter={enter} />
      <ObFigure who="joni" pose={joni} tall={tall} tap={tap} enter={enter} />
    </div>
  );
}

Object.assign(window, { ObFigure, ObDuo, OB_FIG_POSES });
