export type UserDTO = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export class User {
  constructor(
    readonly id: string,
    readonly email: string,
    readonly name: string | null,
    readonly image: string | null,
  ) {}

  static fromSession(input: UserDTO): User {
    return new User(input.id, input.email, input.name, input.image);
  }

  toJSON(): UserDTO {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      image: this.image,
    };
  }
}
