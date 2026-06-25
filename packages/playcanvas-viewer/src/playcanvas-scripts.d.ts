declare module "playcanvas/scripts/esm/annotations.mjs" {
  import { Entity, Script } from "playcanvas";

  export class AnnotationManager extends Script {
    static scriptName: string;
  }

  export class Annotation extends Script {
    static scriptName: string;
    label: string;
    title: string;
    text: string;
    entity: Entity;
    on(event: string, fn: (...args: unknown[]) => void): void;
    fire(event: string, ...args: unknown[]): void;
  }
}
