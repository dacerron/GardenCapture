import * as pc from "playcanvas";

const scratch = new pc.Vec3();
const corners = Array.from({ length: 8 }, () => new pc.Vec3());

type GSplatResourceLike = {
  aabb?: pc.BoundingBox;
};

/** Object-space AABB from the loaded gsplat resource, if available. */
export function getSplatResourceAabb(
  splatEntity: pc.Entity,
): pc.BoundingBox | null {
  const resource = splatEntity.gsplat?.resource as GSplatResourceLike | undefined;
  return resource?.aabb ?? null;
}

/** Lowest world-space Y among the eight corners of the splat resource AABB. */
export function computeWorldAabbMinY(
  splatEntity: pc.Entity,
  aabb: pc.BoundingBox,
): number {
  const min = aabb.getMin();
  const max = aabb.getMax();

  corners[0].set(min.x, min.y, min.z);
  corners[1].set(max.x, min.y, min.z);
  corners[2].set(min.x, max.y, min.z);
  corners[3].set(max.x, max.y, min.z);
  corners[4].set(min.x, min.y, max.z);
  corners[5].set(max.x, min.y, max.z);
  corners[6].set(min.x, max.y, max.z);
  corners[7].set(max.x, max.y, max.z);

  const worldTransform = splatEntity.getWorldTransform();
  let minY = Infinity;
  for (const corner of corners) {
    worldTransform.transformPoint(corner, scratch);
    minY = Math.min(minY, scratch.y);
  }
  return minY;
}
