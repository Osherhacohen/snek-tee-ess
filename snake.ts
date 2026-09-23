import * as readline from 'readline';

const MULTIPLIER = 2; // Keeps terminal aspect ratio square
const BASE_SPEED_FACTOR = 0.6;

const Direction = {
  Up: 0,
  Down: 1,
  Left: 2,
  Right: 3
} as const;
type Direction = typeof Direction[keyof typeof Direction];

const GameState = {
  Menu: 0,
  Playing: 1,
  GameOver: 2,
  Settings: 3,
  Paused: 4,
  SlotMachine: 5
} as const;
type GameState = typeof GameState[keyof typeof GameState];

// Struct for structured configuration profiles
interface Resolution
{
  label: string;
  w: number;
  h: number;
  fullWindow?: boolean;
}

type BoosterKind = 'speed-up' | 'speed-down' | 'shrink' | 'extra-life' | 'score-up' | 'score-down' | 'shield' | 'random';

interface Booster
{
  x: number;
  y: number;
  kind: BoosterKind;
}

const RESOLUTIONS: Resolution[] = [
  { label: 'Small (15x15)', w: 15, h: 15 },
  { label: 'Medium (20x20)', w: 20, h: 20 },
  { label: 'Large (30x25)', w: 30, h: 25 },
  { label: 'Full Window', w: 0, h: 0, fullWindow: true }
];

class Snake
{
  private x: number = 0;
  private y: number = 0;
  private direction: Direction = Direction.Right;
  private lastProcessedDirection: Direction = Direction.Right;
  private directionQueue: Direction[] = [];
  private tail: [number, number][] = [];

  constructor(x: number, y: number, direction: Direction)
  {
    this.reset(x, y, direction);
  }

  public reset(x: number, y: number, direction: Direction): void
  {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.lastProcessedDirection = direction;
    this.directionQueue = [];
    this.tail = [[x, y]];

    switch (direction)
    {
      case Direction.Up:
        this.tail.push([x, y + 1], [x, y + 2]);
        break;
      case Direction.Down:
        this.tail.push([x, y - 1], [x, y - 2]);
        break;
      case Direction.Left:
        this.tail.push([x + 1, y], [x + 2, y]);
        break;
      case Direction.Right:
        this.tail.push([x - 1, y], [x - 2, y]);
        break;
    }
  }

  public move(): void
  {
    if (this.directionQueue.length > 0)
    {
      this.direction = this.directionQueue.shift()!;
    }
    this.lastProcessedDirection = this.direction;

    switch (this.direction)
    {
      case Direction.Up: this.y--; break;
      case Direction.Down: this.y++; break;
      case Direction.Left: this.x--; break;
      case Direction.Right: this.x++; break;
    }

    this.tail.unshift([this.x, this.y]);
    this.tail.pop();
  }

  public grow(): void
  {
    const last = this.tail[this.tail.length - 1] || [this.x, this.y];
    this.tail.push([...last]);
  }

  public shrink(): void
  {
    if (this.tail.length > 2)
    {
      this.tail.splice(Math.ceil(this.tail.length / 2));
    }
  }

  public getDirection(): Direction { return this.direction; }
  public getNextMovementDirection(): Direction { return this.directionQueue[0] ?? this.direction; }
  public getLastProcessedDirection(): Direction { return this.lastProcessedDirection; }
  public setDirection(direction: Direction): void
  {
    const reference = this.directionQueue[this.directionQueue.length - 1] ?? this.direction;
    const isReverse =
      (reference === Direction.Up && direction === Direction.Down) ||
      (reference === Direction.Down && direction === Direction.Up) ||
      (reference === Direction.Left && direction === Direction.Right) ||
      (reference === Direction.Right && direction === Direction.Left);

    if (direction !== reference && !isReverse && this.directionQueue.length < 2)
    {
      this.directionQueue.push(direction);
    }
  }
  public getPosition(): [number, number] { return [this.x, this.y]; }
  public getTail(): [number, number][] { return this.tail; }
}

class Game
{
  private width!: number;
  private height!: number;
  private snake!: Snake;
  private fruit!: [number, number];
  private booster: Booster | null = null;
  private score: number = 0;
  private highScore: number = 0;
  private lives: number = 1;
  private scoreMultiplier: number = 1;
  private speedMultiplier: number = 1;
  private shieldCharges: number = 0;
  private state: GameState = GameState.Menu;

  // Custom Settings Properties
  private speedSetting: number = 1.00; // Variable modifier between 0.01 and 5.00
  private resIndex: number = 1;        // Points to Medium (20x20) default layout
  private boostersEnabled: boolean = true;
  private destroyModeHold: boolean = false;
  private menuIndex: number = 0;
  private pauseMenuIndex: number = 0;
  private destroyArmed: boolean = false;
  private destroyRequested: boolean = false;
  private slotAnimationTimer: NodeJS.Timeout | null = null;
  private slotFrame: number = 0;
  private gameLoopTimer: NodeJS.Timeout | null = null;

  constructor()
  {
    this.updateGridGeometry();
  }

  private updateGridGeometry(): void
  {
    const currentRes = RESOLUTIONS[this.resIndex];
    if (currentRes.fullWindow)
    {
      const terminalWidth = process.stdout.columns || 80;
      const terminalHeight = process.stdout.rows || 25;
      this.width = Math.max(16, terminalWidth - 2);
      this.height = Math.max(8, terminalHeight - 4);
    } else
    {
      this.width = Math.floor(currentRes.w * MULTIPLIER);
      this.height = currentRes.h;
    }
    this.snake = new Snake(Math.floor(this.width / 2), Math.floor(this.height / 2), Direction.Right);
  }

  private initNewGame(): void
  {
    this.score = 0;
    this.lives = 1;
    this.scoreMultiplier = 1;
    this.speedMultiplier = 1;
    this.shieldCharges = 0;
    this.booster = null;
    this.destroyArmed = false;
    this.updateGridGeometry();
    const start = this.getRandomStart();
    this.snake.reset(start.x, start.y, start.direction);
    this.fruit = this.getRandomPosition();
    this.state = GameState.Playing;

    process.stdout.write('\x1b[2J');
    this.render();
    this.scheduleNextFrame(this.getMoveDelay());
  }

  private getRandomStart(): { x: number; y: number; direction: Direction }
  {
    const directions = [Direction.Up, Direction.Down, Direction.Left, Direction.Right];
    const candidates: { x: number; y: number; direction: Direction }[] = [];

    // Start near, but not against, a wall. Every candidate has room for the body and first move.
    for (let y = 3; y < this.height - 3; y++)
    {
      for (let x = 3; x < this.width - 3; x++)
      {
        const distanceToWall = Math.min(x, this.width - 1 - x, y, this.height - 1 - y);
        if (distanceToWall > 5) continue;
        for (const direction of directions)
        {
          candidates.push({ x, y, direction });
        }
      }
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private gameLoop(): void
  {
    if (this.state !== GameState.Playing) return;

    this.snake.move();

    if (this.checkCollision())
    {
      if (this.shieldCharges > 0)
      {
        this.shieldCharges--;
        const start = this.getRandomStart();
        this.snake.reset(start.x, start.y, start.direction);
        this.fruit = this.getRandomPosition();
      } else if (this.lives > 1)
      {
        this.lives--;
        const start = this.getRandomStart();
        this.snake.reset(start.x, start.y, start.direction);
        this.fruit = this.getRandomPosition();
        this.render();
        this.scheduleNextFrame(this.getMoveDelay());
        return;
      } else
      {
      if (this.score > this.highScore)
      {
        this.highScore = this.score;
      }
      this.state = GameState.GameOver;
      this.menuIndex = 0;
      process.stdout.write('\x1b[2J');
      this.render();
      return;
      }
    }

    this.checkFruit();
    this.checkBooster();
    this.render();
    this.scheduleNextFrame(this.getMoveDelay());
  }

  private getMoveDelay(): number
  {
    const baseDelay = 100 / (BASE_SPEED_FACTOR * this.speedSetting * this.speedMultiplier);
    const direction = this.snake.getNextMovementDirection();
    const isHorizontal = direction === Direction.Left || direction === Direction.Right;
    return isHorizontal ? baseDelay / MULTIPLIER : baseDelay;
  }

  private scheduleNextFrame(delay: number): void
  {
    this.gameLoopTimer = setTimeout(() => this.gameLoop(), delay);
  }

  private togglePause(): void
  {
    if (this.state === GameState.Playing)
    {
      if (this.gameLoopTimer)
      {
        clearTimeout(this.gameLoopTimer);
        this.gameLoopTimer = null;
      }
      this.state = GameState.Paused;
      this.pauseMenuIndex = 0;
      this.render();
    } else if (this.state === GameState.Paused)
    {
      this.state = GameState.Playing;
      this.render();
      this.scheduleNextFrame(0);
    }
  }

  private returnToMainMenu(): void
  {
    if (this.gameLoopTimer)
    {
      clearTimeout(this.gameLoopTimer);
      this.gameLoopTimer = null;
    }
    this.state = GameState.Menu;
    this.menuIndex = 0;
    process.stdout.write('\x1b[2J');
    this.render();
  }

  private handlePauseSelection(): void
  {
    if (this.pauseMenuIndex === 0)
    {
      this.togglePause();
    } else
    {
      this.returnToMainMenu();
    }
  }

  private checkCollision(): boolean
  {
    const [hx, hy] = this.snake.getPosition();

    if (hx < 0 || hy < 0 || hx >= this.width || hy >= this.height)
    {
      return true;
    }

    const tail = this.snake.getTail();
    for (let i = 1; i < tail.length; i++)
    {
      if (tail[i][0] === hx && tail[i][1] === hy)
      {
        return true;
      }
    }
    return false;
  }

  private checkFruit(): void
  {
    const [hx, hy] = this.snake.getPosition();
    if (hx === this.fruit[0] && hy === this.fruit[1])
    {
      this.snake.grow();
      // Score increments scaling perfectly alongside the difficulty setting
      this.score += Math.round(10 * this.speedSetting * this.scoreMultiplier);
      this.fruit = this.getRandomPosition();
      if (this.boostersEnabled && !this.booster && Math.random() < 0.3)
      {
        this.spawnBooster();
      }
    }
  }

  private spawnBooster(): void
  {
    const position = this.getRandomPosition();
    this.booster = { x: position[0], y: position[1], kind: this.getRandomBoosterKind() };
  }

  private getRandomBoosterKind(): BoosterKind
  {
    const roll = Math.random();
    if (roll < 0.005) return 'extra-life';
    if (roll < 0.15) return 'random';
    if (roll < 0.30) return 'speed-up';
    if (roll < 0.42) return 'speed-down';
    if (roll < 0.56) return 'shrink';
    if (roll < 0.70) return 'score-up';
    if (roll < 0.82) return 'score-down';
    return 'shield';
  }

  private checkBooster(): void
  {
    if (!this.booster) return;
    const [headX, headY] = this.snake.getPosition();
    if (headX !== this.booster.x || headY !== this.booster.y) return;

    const booster = this.booster;
    this.booster = null;
    if (this.destroyRequested || this.destroyArmed)
    {
      this.destroyRequested = false;
      this.destroyArmed = false;
      return;
    }

    if (booster.kind === 'random')
    {
      this.state = GameState.SlotMachine;
      this.slotFrame = 0;
      this.slotAnimationTimer = setInterval(() =>
      {
        this.slotFrame++;
        this.render();
      }, 180);
      this.render();
      setTimeout(() => this.resolveRandomBooster(), 2000);
      return;
    }

    this.applyBooster(booster.kind);
    this.destroyRequested = false;
  }

  private resolveRandomBooster(): void
  {
    if (this.state !== GameState.SlotMachine) return;
    if (this.slotAnimationTimer)
    {
      clearInterval(this.slotAnimationTimer);
      this.slotAnimationTimer = null;
    }
    const positive = Math.random() < 0.8;
    const kind: BoosterKind = positive
      ? (Math.random() < 0.02 ? 'extra-life' : Math.random() < 0.5 ? 'speed-up' : 'score-up')
      : (Math.random() < 0.5 ? 'speed-down' : 'score-down');
    this.applyBooster(kind);
    this.state = GameState.Playing;
    this.render();
    this.scheduleNextFrame(this.getMoveDelay());
  }

  private applyBooster(kind: BoosterKind): void
  {
    switch (kind)
    {
      case 'speed-up': this.speedMultiplier = Math.min(3, this.speedMultiplier + 0.25); break;
      case 'speed-down': this.speedMultiplier = Math.max(0.5, this.speedMultiplier - 0.2); break;
      case 'shrink': this.snake.shrink(); break;
      case 'extra-life': this.lives++; break;
      case 'score-up': this.scoreMultiplier = Math.min(3, this.scoreMultiplier + 0.25); break;
      case 'score-down': this.scoreMultiplier = Math.max(0.5, this.scoreMultiplier - 0.2); break;
      case 'shield': this.shieldCharges++; break;
    }
  }

  private getRandomPosition(): [number, number]
  {
    const tail = this.snake.getTail();
    const available: [number, number][] = [];

    for (let y = 0; y < this.height; y++)
    {
      for (let x = 0; x < this.width; x++)
      {
        const occupiedBySnake = tail.some(seg => seg[0] === x && seg[1] === y);
        const occupiedByBooster = this.booster?.x === x && this.booster.y === y;
        if (!occupiedBySnake && !occupiedByBooster)
        {
          available.push([x, y]);
        }
      }
    }

    return available[Math.floor(Math.random() * available.length)];
  }

  private render(): void
  {
    let frame = '\x1b[H';

    switch (this.state)
    {
      case GameState.Menu:
        frame += this.renderMenuWindow();
        break;
      case GameState.GameOver:
        frame += this.renderGameOverWindow();
        break;
      case GameState.Settings:
        frame += this.renderSettingsWindow();
        break;
      case GameState.Playing:
        frame += this.renderGameGrid();
        break;
      case GameState.Paused:
        frame += this.renderGameGrid();
        frame += this.renderPauseWindow();
        break;
      case GameState.SlotMachine:
        frame += this.renderGameGrid();
        frame += this.renderSlotMachineWindow();
        break;
    }

    process.stdout.write(frame);
  }

  private renderMenuWindow(): string
  {
    let m = '\n';
    m += '  \x1b[35m\x1b[1m=========================================\x1b[0m\n';
    m += '  \x1b[32m\x1b[1m              S N E K   G A M E          \x1b[0m\n';
    m += '  \x1b[35m\x1b[1m=========================================\x1b[0m\n\n';
    m += '     Navigate with Up/Down or W/S, Enter to select:\n\n';
    m += `     ${this.menuIndex === 0 ? '\x1b[33m\x1b[1m> START GAME\x1b[0m' : '  START GAME'}\n`;
    m += `     ${this.menuIndex === 1 ? '\x1b[33m\x1b[1m> SETTINGS\x1b[0m' : '  SETTINGS'}\n`;
    m += `     ${this.menuIndex === 2 ? '\x1b[33m\x1b[1m> EXIT\x1b[0m' : '  EXIT'}\n\n`;
    m += '  \x1b[90m-----------------------------------------\x1b[0m\n';
    m += `   High Score: \x1b[36m${this.highScore}\x1b[0m    Current Speed: \x1b[33mx${this.speedSetting.toFixed(2)}\x1b[0m\n`;
    return m;
  }

  private renderSettingsWindow(): string
  {
    let s = '\n';
    s += '  \x1b[36m\x1b[1m=========================================\x1b[0m\n';
    s += '  \x1b[36m\x1b[1m               S E T T I N G S         \x1b[0m\n';
    s += '  \x1b[36m\x1b[1m=========================================\x1b[0m\n\n';
    s += '     Use Left/Right or A/D keys to adjust options value:\n\n';

    s += `     ${this.menuIndex === 0 ? '\x1b[33m\x1b[1m> Game Speed:\x1b[0m' : '  Game Speed:'}   [ \x1b[35m-\x1b[0m \x1b[1mx${this.speedSetting.toFixed(2)}\x1b[0m \x1b[32m+\x1b[0m ] (Score Multiplier: x${this.speedSetting.toFixed(1)})\n`;
    s += `     ${this.menuIndex === 1 ? '\x1b[33m\x1b[1m> Resolution:\x1b[0m' : '  Resolution:'}   [ \x1b[32m\x1b[1m${RESOLUTIONS[this.resIndex].label}\x1b[0m ]\n`;
    s += `     ${this.menuIndex === 2 ? '\x1b[33m\x1b[1m> Boosters:\x1b[0m' : '  Boosters:'}      [ \x1b[32m\x1b[1m${this.boostersEnabled ? 'ON' : 'OFF'}\x1b[0m ]\n`;
    s += `     ${this.menuIndex === 3 ? '\x1b[33m\x1b[1m> Destroy Mode:\x1b[0m' : '  Destroy Mode:'}  [ \x1b[32m\x1b[1m${this.destroyModeHold ? 'HOLD' : 'TOGGLE'}\x1b[0m ]\n\n`;
    s += `     ${this.menuIndex === 4 ? '\x1b[33m\x1b[1m> BACK TO MAIN MENU\x1b[0m' : '  BACK TO MAIN MENU'}\n\n`;
    s += '  \x1b[90m-----------------------------------------\x1b[0m\n';
    return s;
  }

  private renderGameOverWindow(): string
  {
    let m = '\n';
    m += '  \x1b[31m\x1b[1m=========================================\x1b[0m\n';
    m += '  \x1b[31m\x1b[1m               G A M E   O V E R         \x1b[0m\n';
    m += '  \x1b[31m\x1b[1m=========================================\x1b[0m\n\n';
    m += `     Your Score: \x1b[32m${this.score}\x1b[0m      High Score: \x1b[36m${this.highScore}\x1b[0m\n\n`;
    m += `     ${this.menuIndex === 0 ? '\x1b[33m\x1b[1m> PLAY AGAIN\x1b[0m' : '  PLAY AGAIN'}\n`;
    m += `     ${this.menuIndex === 1 ? '\x1b[33m\x1b[1m> MAIN MENU\x1b[0m' : '  MAIN MENU'}\n`;
    m += `     ${this.menuIndex === 2 ? '\x1b[33m\x1b[1m> EXIT\x1b[0m' : '  EXIT'}\n\n`;
    return m;
  }

  private renderGameGrid(): string
  {
    let g = '\x1b[90m+' + '-'.repeat(this.width) + '+\x1b[0m\n';
    const [hx, hy] = this.snake.getPosition();
    const tail = this.snake.getTail();
    const destroyModeActive = this.boostersEnabled && (this.destroyModeHold || this.destroyArmed);
    const snakeColor = destroyModeActive ? '\x1b[36m' : '\x1b[32m';

    for (let y = 0; y < this.height; y++)
    {
      g += '\x1b[90m|\x1b[0m';
      for (let x = 0; x < this.width; x++)
      {
        if (hx === x && hy === y)
        {
          g += `${snakeColor}\x1b[1mO\x1b[0m`;
        } else if (this.booster && this.booster.x === x && this.booster.y === y)
        {
          g += `\x1b[35m\x1b[1m${this.booster.kind === 'random' ? '?' : this.getBoosterLabel(this.booster.kind)[0]}\x1b[0m`;
        } else if (this.fruit[0] === x && this.fruit[1] === y)
        {
          g += '\x1b[31m\x1b[1mX\x1b[0m';
        } else
        {
          const isBody = tail.slice(1).some(seg => seg[0] === x && seg[1] === y);
          g += isBody ? `${snakeColor}o\x1b[0m` : ' ';
        }
      }
      g += '\x1b[90m|\x1b[0m\n';
    }

    g += '\x1b[90m+' + '-'.repeat(this.width) + '+\x1b[0m\n';
    const boosterText = this.booster ? `   Booster: \x1b[35m${this.getBoosterLabel(this.booster.kind)}\x1b[0m` : '';
    const destroyText = this.boostersEnabled ? `   Destroy: ${this.destroyModeHold ? 'HOLD' : this.destroyArmed ? 'ARMED' : 'SPACE'}` : '';
    g += ` Lives: \x1b[31m${this.lives}\x1b[0m   Score x\x1b[33m${this.scoreMultiplier.toFixed(2)}\x1b[0m   Speed x\x1b[35m${(this.speedSetting * this.speedMultiplier).toFixed(2)}\x1b[0m   Shield: ${this.shieldCharges}${boosterText}${destroyText}   Exit: Ctrl+C`;
    return g;
  }

  private getBoosterLabel(kind: BoosterKind): string
  {
    const labels: Record<BoosterKind, string> = {
      'speed-up': 'SPEED+',
      'speed-down': 'SPEED-',
      shrink: 'SHRINK',
      'extra-life': '1-UP',
      'score-up': 'SCORE+',
      'score-down': 'SCORE-',
      shield: 'SHIELD',
      random: '?'
    };
    return labels[kind];
  }

  private renderPauseWindow(): string
  {
    const windowWidth = 30;
    const left = Math.max(1, Math.floor((this.width + 2 - windowWidth) / 2));
    const top = Math.max(2, Math.floor(this.height / 2) - 3);
    const line = '\x1b[90m+' + '-'.repeat(windowWidth - 2) + '+\x1b[0m';
    const innerWidth = windowWidth - 2;
    const modalRow = (text: string, color: string): string =>
      `${color}|${text.padStart(Math.floor((innerWidth + text.length) / 2)).padEnd(innerWidth)}|\x1b[0m`;
    const title = modalRow('GAME PAUSED', '\x1b[33m\x1b[1m');
    const resume = modalRow(`${this.pauseMenuIndex === 0 ? '> ' : '  '}RESUME`, this.pauseMenuIndex === 0 ? '\x1b[33m\x1b[1m' : '\x1b[36m');
    const mainMenu = modalRow(`${this.pauseMenuIndex === 1 ? '> ' : '  '}MAIN MENU`, this.pauseMenuIndex === 1 ? '\x1b[33m\x1b[1m' : '\x1b[36m');
    const hint = modalRow('Arrows / WASD: Navigate', '\x1b[36m');

    return `\x1b[${top};${left}H${line}\n\x1b[${left}G${title}\n\x1b[${left}G${resume}\n\x1b[${left}G${mainMenu}\n\x1b[${left}G${hint}\n\x1b[${left}G${line}`;
  }

  private renderSlotMachineWindow(): string
  {
    const windowWidth = 30;
    const left = Math.max(1, Math.floor((this.width + 2 - windowWidth) / 2));
    const top = Math.max(2, Math.floor(this.height / 2) - 2);
    const line = '\x1b[35m+' + '-'.repeat(windowWidth - 2) + '+\x1b[0m';
    const innerWidth = windowWidth - 2;
    const row = (text: string): string => `\x1b[33m|${text.padStart(Math.floor((innerWidth + text.length) / 2)).padEnd(innerWidth)}|\x1b[0m`;
    const symbols = ['?', 'S', '+', '?', '1'];
    const symbol = symbols[this.slotFrame % symbols.length];
    return `\x1b[${top};${left}H${line}\n\x1b[${left}G${row('LUCKY BOOSTER')}\n\x1b[${left}G${row(`[ ${symbol} ]`)}\n\x1b[${left}G${row('ROLLING...')}\n\x1b[${left}G${line}`;
  }

  private handleMenuSelection(): void
  {
    if (this.state === GameState.Menu)
    {
      if (this.menuIndex === 0)
      {
        this.initNewGame();
      } else if (this.menuIndex === 1)
      {
        this.state = GameState.Settings;
        this.menuIndex = 0;
        process.stdout.write('\x1b[2J');
        this.render();
      } else
      {
        process.exit();
      }
    } else if (this.state === GameState.Settings)
    {
      if (this.menuIndex === 4)
      {
        this.state = GameState.Menu;
        this.menuIndex = 0;
        process.stdout.write('\x1b[2J');
        this.render();
      }
    } else if (this.state === GameState.GameOver)
    {
      if (this.menuIndex === 0)
      {
        this.initNewGame();
      } else if (this.menuIndex === 1) { this.state = GameState.Menu; this.menuIndex = 0; process.stdout.write('\x1b[2J'); this.render(); } else { process.exit(); }
    }
  } private handleSettingsAdjustment(dir: 'left' | 'right'): void
  {
    if (this.menuIndex === 0)
    {// Adjust Speed limits (x0.01 to x5.00)
      if (dir === 'left') { this.speedSetting = Math.max(0.01, this.speedSetting - 0.25); if (this.speedSetting < 0.25 && this.speedSetting > 0.01) this.speedSetting = 0.01; } else { if (this.speedSetting === 0.01) this.speedSetting = 0.00; this.speedSetting = Math.min(5.00, this.speedSetting + 0.25); }
    } else if (this.menuIndex === 1)
    {// Cycle Resolution Layout Arrays
      if (dir === 'left') { this.resIndex = (this.resIndex - 1 + RESOLUTIONS.length) % RESOLUTIONS.length; } else { this.resIndex = (this.resIndex + 1) % RESOLUTIONS.length; } this.updateGridGeometry();
    } else if (this.menuIndex === 2)
    {
      this.boostersEnabled = !this.boostersEnabled;
      if (!this.boostersEnabled) this.booster = null;
    } else if (this.menuIndex === 3)
    {
      this.destroyModeHold = !this.destroyModeHold;
    }
    this.render();
  }

  private isKey(key: { name?: string; sequence?: string }, expected: string): boolean
  {
    if (key.name?.toLowerCase() === expected)
    {
      return true;
    }

    const sequences: Record<string, string> = {
      up: '\x1b[A',
      down: '\x1b[B',
      right: '\x1b[C',
      left: '\x1b[D',
      escape: '\x1b',
      return: '\r',
      space: ' '
    };
    return key.sequence === sequences[expected];
  }

  public start(): void
  {
    process.stdout.write('\x1b[?25l'); process.stdout.write('\x1b[2J'); process.on('exit', () => process.stdout.write('\x1b[?25h')); readline.emitKeypressEvents(process.stdin); if (process.stdin.setRawMode) { process.stdin.setRawMode(true); } process.stdin.resume(); process.stdin.on('keypress', (_, key) =>
    {
      if (!key) return; if (key.ctrl && key.name === 'c') process.exit();// UI Layout Action Handling Loop
      if ((this.isKey(key, 'p') && (this.state === GameState.Playing || this.state === GameState.Paused)) || (this.isKey(key, 'space') && this.state === GameState.Paused)) { this.togglePause(); return; }
      if (this.state === GameState.Playing && this.isKey(key, 'space'))
      {
        if (this.destroyModeHold) this.destroyRequested = true;
        else this.destroyArmed = !this.destroyArmed;
        this.render();
        return;
      }
      if (this.state === GameState.SlotMachine) return;
      if (this.state === GameState.Paused && (this.isKey(key, 'escape') || this.isKey(key, 'm'))) { this.returnToMainMenu(); return; }
      if (this.state === GameState.Paused)
      {
        if (this.isKey(key, 'up') || this.isKey(key, 'w') || this.isKey(key, 'down') || this.isKey(key, 's'))
        {
          this.pauseMenuIndex = this.pauseMenuIndex === 0 ? 1 : 0;
          this.render();
        } else if (this.isKey(key, 'return'))
        {
          this.handlePauseSelection();
        }
        return;
      }
      if (this.state === GameState.Menu || this.state === GameState.GameOver || this.state === GameState.Settings) { let maxOptions = this.state === GameState.Settings ? 5 : 3; if (this.isKey(key, 'up') || this.isKey(key, 'w')) { this.menuIndex = (this.menuIndex - 1 + maxOptions) % maxOptions; this.render(); } else if (this.isKey(key, 'down') || this.isKey(key, 's')) { this.menuIndex = (this.menuIndex + 1) % maxOptions; this.render(); } else if (this.isKey(key, 'left') || this.isKey(key, 'a')) { if (this.state === GameState.Settings) this.handleSettingsAdjustment('left'); } else if (this.isKey(key, 'right') || this.isKey(key, 'd')) { if (this.state === GameState.Settings) this.handleSettingsAdjustment('right'); } else if (this.isKey(key, 'return')) { this.handleMenuSelection(); } return; }// Live In-Game Snake Core Controls
      if (this.isKey(key, 'up') || this.isKey(key, 'w')) this.snake.setDirection(Direction.Up);
      else if (this.isKey(key, 'down') || this.isKey(key, 's')) this.snake.setDirection(Direction.Down);
      else if (this.isKey(key, 'left') || this.isKey(key, 'a')) this.snake.setDirection(Direction.Left);
      else if (this.isKey(key, 'right') || this.isKey(key, 'd')) this.snake.setDirection(Direction.Right);
    }); this.render();
  }
} const game = new Game(); game.start(); export default game;
