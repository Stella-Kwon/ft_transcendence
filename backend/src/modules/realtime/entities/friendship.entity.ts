import { Entity, PrimaryKey, Property, ManyToOne, Unique, OneToMany, Index } from "@mikro-orm/core";
import { User } from "../../user/entities/user.entity";

@Entity()
@Unique({ properties: ['requester', 'addressee'] })
export class FriendRequest {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  requester!: User;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  addressee!: User;

  @Property()
  status: 'pending' | 'accepted' | 'rejected' = 'pending';

  @Property()
  createdAt: Date = new Date();

  @Property({ nullable: true })
  acceptedAt?: Date;
}
  

//user<->user middle table
@Entity()
@Index({ properties: ['user', 'friend'] })
export class Friendship {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  user!: User;

  @ManyToOne(() => User, { deleteRule: 'cascade' })
  friend!: User;

  @Property()
  status: 'active' | 'blocked' = 'active';
  
  @Property({ type: 'timestamptz'})
  createdAt?: Date;
}
