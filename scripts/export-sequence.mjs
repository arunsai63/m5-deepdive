import {writeFileSync} from 'node:fs';
import {createSceneData,materials} from '../scene-data.js';
import {hierarchy,annotations,journeyAt,JOURNEY_END} from '../journey.js';
const count=480;
writeFileSync(new URL('../assets/source/blender/sequence-recipe.json',import.meta.url),JSON.stringify({
  materials,scenes:createSceneData(),hierarchy,annotations,journeyEnd:JOURNEY_END,
  frames:Array.from({length:count},(_,i)=>({progress:i/(count-1)*JOURNEY_END,...journeyAt(i/(count-1)*JOURNEY_END,1.6)})),
}));
