import * as readline from 'readline';

const MULTIPLIER = 2.75;

enum Direction
{
  Up,
  Down,
  Left,
  Right
}

class Snake
{
  private x: number;
  private y: number;
  private direction: Direction;
  private tail: [number, number][];

  constructor(x: number, y: number, direction: Direction)
  {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.tail = [[x, y]];
  }

  public move(): void
  {
    this.tail.pop();
    this.tail.unshift([this.x, this.y]);

    switch (this.direction)
    {
      case Direction.Up:
        this.y--;
        break;
      case Direction.Down:
        this.y++;
        break;
      case Direction.Left:
        this.x--;
        break;
      case Direction.Right:
        this.x++;
        break;
    }
  }

  public grow(): void
  {
    this.tail.unshift([this.x, this.y]);
  }
  public getDirection(): Direction
  {
    return this.direction;
  }
  public setDirection(direction: Direction): void
  {
    this.direction = direction;
  }

  public getPosition(): [number, number]
  {
    return [this.x, this.y];
  }

  public getTail(): [number, number][]
  {
    return this.tail;
  }
}

class Game
{
  private width: number;
  private height: number;
  private snake: Snake;
  private fruit: [number, number];
  private gameSpeed: number = 1;

  constructor(width: number, height: number, gameSpeed?: number)
  {
    this.width = width*MULTIPLIER;
    this.height = height;
    this.snake = new Snake(Math.floor(width / 2), Math.floor(height / 2), Direction.Right);
    this.fruit = this.getRandomPosition();
    if (gameSpeed)
    {
      this.gameSpeed = 1/gameSpeed;
    }
  }

  private moveSnake(): void
  {
    this.snake.move();
    const [x, y] = this.snake.getPosition();
    if (x < 0 || y < 0 || x >= this.width || y >= this.height)
    {
      console.log('Game over!');
      process.exit();
    }
    for (const segment of this.snake.getTail())
    {
      if (segment[0] === x && segment[1] === y)
      {
        console.log('Game over!');
        process.exit();
      }
    }
  }

  private checkFruit(): void
  {
    if (this.snake.getPosition()[0] === this.fruit[0] && this.snake.getPosition()[1] === this.fruit[1])
    {
      this.snake.grow();
      this.fruit = this.getRandomPosition();
    }
  }

  private getRandomPosition(): [number, number]
  {
    return [Math.floor(Math.random() * this.width), Math.floor(Math.random() * this.height)];
  }

  private render(): void
  {
    // Clear the console before rendering the game board
    console.clear();

    // Draw the top border
    let row = '';
    for (let i = 0; i < this.width; i++)
    {
      row += '+';
    }
    console.log(row);

    // Draw the rows of the game board
    for (let y = 0; y < this.height; y++)
    {
      row = '|';
      for (let x = 0; x < this.width; x++)
      {
        if (this.snake.getPosition()[0] === x && this.snake.getPosition()[1] === y)
        {
          row += 'O';
        } else if (this.fruit[0] === x && this.fruit[1] === y)
        {
          row += 'X';
        } else
        {
          let found = false;
          for (const segment of this.snake.getTail())
          {
            if (segment[0] === x && segment[1] === y)
            {
              row += 'o';
              found = true;
              break;
            }
          }
          if (!found)
          {
            row += ' ';
          }
        }
      }
      row += '|';
      console.log(row);
    }

    // Draw the bottom border
    row = '';
    for (let i = 0; i < this.width; i++)
    {
      row += '+';
    }
    console.log(row);
  }

  public start(): void
  {
    this.fruit = this.getRandomPosition();
    this.render();
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (_, key) =>
    {
      switch (key.name)
      {
        case 'up':
          if (this.snake.getDirection() !== Direction.Down)
          {
            this.snake.setDirection(Direction.Up);
          }
          break;
        case 'down':
          if (this.snake.getDirection() !== Direction.Up)
          {
            this.snake.setDirection(Direction.Down);
          }
          break;
        case 'left':
          if (this.snake.getDirection() !== Direction.Right)
          {
            this.snake.setDirection(Direction.Left);
          }
          break;
        case 'right':
          if (this.snake.getDirection() !== Direction.Left)
          {
            this.snake.setDirection(Direction.Right);
          }
          break;
      }
    });
    console.log(this.gameSpeed * 100)
    setInterval(() =>
    {
      this.moveSnake();
      this.checkFruit();
      this.render();
    }, 100 * this.gameSpeed*((this.snake.getDirection()===Direction.Left||this.snake.getDirection()===Direction.Right)?(1/(MULTIPLIER)):1));
  }
}

const game = new Game(20, 20, 1);
game.start();

export default game;


