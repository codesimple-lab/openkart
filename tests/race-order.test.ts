import { describe, expect, it } from 'vitest';
import { Course } from '../src/game/course';
import { Race } from '../src/game/race';

describe('finish order',()=>{
  it('keeps earlier finishers ahead even if a later kart rolls farther past the line',()=>{
    const race=new Race(new Course());
    const [player,first,second]=race.racers;
    first.finished=170;first.distance=race.course.length*3+.01;
    second.finished=171;second.distance=race.course.length*3+.1;
    player.finished=172;player.distance=race.course.length*3+.3;
    expect(race.position).toBe(3);
  });
  it('keeps the finish result stable as the remaining racers reach the line',()=>{
    const race=new Race(new Course());
    race.player.finished=170;race.player.distance=race.course.length*3+.01;
    race.racers[1].finished=175;race.racers[1].distance=race.course.length*3+.4;
    expect(race.position).toBe(1);
  });
});
