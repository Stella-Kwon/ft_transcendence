import { Entity, PrimaryKey, Property, Collection, OneToMany } from "@mikro-orm/core";
import { RoomMember } from "./room-member.entity";

@Entity()
export class Room {
	@PrimaryKey({ type: 'uuid' })
	id!: string;

	@Property()
	name!: string;

	@Property({ type: 'uuid' })
	masterId!: string;

	@Property({ nullable: true })
	description?: string;

	@Property()
	isPrivate: boolean = false;

	@Property()
	maxUsers: number = 50;

	@Property()
	createdAt: Date = new Date();

	@Property({ onUpdate: () => new Date() })
	updatedAt: Date = new Date();

	@OneToMany(() => RoomMember, member => member.room, { orphanRemoval: true})
	members = new Collection<RoomMember>(this);
} 