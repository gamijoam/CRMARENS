import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin1234", 10);

  const organization = await prisma.organization.upsert({
    where: { id: "demo-org" },
    update: {},
    create: {
      id: "demo-org",
      name: "Empresa Demo",
      timezone: "America/Caracas"
    }
  });

  const owner = await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      name: "Admin Demo",
      email: "admin@demo.com",
      passwordHash
    }
  });

  await prisma.organizationUser.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: owner.id
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: owner.id,
      role: "owner"
    }
  });

  const pipeline = await prisma.pipeline.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Ventas"
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Ventas"
    }
  });

  await prisma.pipelineStage.createMany({
    data: ["Nuevo", "Contactado", "Interesado", "Negociacion", "Ganado", "Perdido"].map(
      (name, position) => ({
        pipelineId: pipeline.id,
        name,
        position
      })
    ),
    skipDuplicates: true
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
