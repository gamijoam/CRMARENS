import { IsEmail, IsIn, IsString, MinLength } from "class-validator";

const organizationRoles = ["owner", "admin", "supervisor", "seller"] as const;
type OrganizationRole = (typeof organizationRoles)[number];

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(organizationRoles)
  role!: OrganizationRole;
}
