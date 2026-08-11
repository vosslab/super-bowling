import RAPIER from "@dimforge/rapier2d-compat";

import { fallen_pin_length } from "../config/lane";
import {
  get_ball_mass_lb,
  get_pin_contact_force_event_threshold,
  physics_config,
} from "../config/physics";
import type { RackPinCount } from "../config/pin_counts";
import type { BallRecord } from "./world_contracts";

export function create_pin_body(world: RAPIER.World, x: number, y: number): RAPIER.RigidBody {
  const body_description = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y)
    .setLinearDamping(physics_config.pin_linear_damping)
    .setCanSleep(true);
  const body = world.createRigidBody(body_description);
  body.sleep();
  return body;
}

export function create_pin_collider(world: RAPIER.World, body: RAPIER.RigidBody): RAPIER.Collider {
  const collider_description = RAPIER.ColliderDesc.ball(physics_config.pin_radius)
    .setMass(physics_config.pin_mass_lb)
    .setFriction(physics_config.pin_friction)
    .setRestitution(physics_config.restitution)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    .setContactForceEventThreshold(get_pin_contact_force_event_threshold());
  return world.createCollider(collider_description, body);
}

export function create_fallen_pin_collider(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  direction: { x: number; y: number },
  mass: number,
): RAPIER.Collider {
  // Rapier capsules are measured along their local y axis. Its two rounded
  // ends are included in `fallen_pin_length`, so the straight middle excludes
  // one radius at each end.
  const half_height = fallen_pin_length / 2 - physics_config.pin_radius;
  const collider_description = RAPIER.ColliderDesc.capsule(half_height, physics_config.pin_radius)
    .setTranslation(direction.x * (fallen_pin_length / 2), direction.y * (fallen_pin_length / 2))
    .setRotation(Math.atan2(direction.y, direction.x) - Math.PI / 2)
    // Shape changes must not give a fallen pin extra inertia by silently adding
    // material. Rapier derives the new angular inertia from this same mass.
    .setMass(mass)
    .setFriction(physics_config.pin_friction)
    .setRestitution(physics_config.restitution)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    .setContactForceEventThreshold(get_pin_contact_force_event_threshold());
  return world.createCollider(collider_description, body);
}

export function create_ball_body(world: RAPIER.World, pin_count: RackPinCount): BallRecord {
  const body_description = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, 0)
    .setLinearDamping(0)
    .setCanSleep(true)
    .lockRotations();
  const body = world.createRigidBody(body_description);
  const collider_description = RAPIER.ColliderDesc.ball(physics_config.ball_radius)
    .setMass(get_ball_mass_lb(pin_count))
    .setFriction(physics_config.lane_friction)
    .setRestitution(physics_config.restitution)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
    .setContactForceEventThreshold(get_pin_contact_force_event_threshold());
  const collider = world.createCollider(collider_description, body);
  body.sleep();
  return { body, collider_handle: collider.handle };
}

export function create_static_cuboid(
  world: RAPIER.World,
  x: number,
  y: number,
  half_width: number,
  half_height: number,
  sensor = false,
): RAPIER.Collider {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y));
  let description = RAPIER.ColliderDesc.cuboid(half_width, half_height).setSensor(sensor);
  if (sensor) description = description.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  return world.createCollider(description, body);
}
