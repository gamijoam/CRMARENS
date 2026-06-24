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

  const firstStage = await prisma.pipelineStage.findFirstOrThrow({
    where: { pipelineId: pipeline.id },
    orderBy: { position: "asc" }
  });

  const demoContact = await prisma.contact.upsert({
    where: { id: "demo-contact-maria" },
    update: {},
    create: {
      id: "demo-contact-maria",
      organizationId: organization.id,
      fullName: "Maria Fernanda Rivas",
      phone: "+58 412-555-0184",
      email: "maria.rivas@example.com",
      tags: ["premium", "whatsapp"]
    }
  });

  const demoLead = await prisma.lead.upsert({
    where: { id: "demo-lead-maria" },
    update: {},
    create: {
      id: "demo-lead-maria",
      organizationId: organization.id,
      contactId: demoContact.id,
      pipelineId: pipeline.id,
      stageId: firstStage.id,
      value: 1250,
      currency: "USD",
      assignedUserId: owner.id
    }
  });

  await prisma.task.upsert({
    where: { id: "demo-task-maria" },
    update: {},
    create: {
      id: "demo-task-maria",
      organizationId: organization.id,
      contactId: demoContact.id,
      leadId: demoLead.id,
      title: "Enviar propuesta comercial",
      assignedUserId: owner.id,
      createdByUserId: owner.id
    }
  });

  await prisma.note.upsert({
    where: { id: "demo-note-maria" },
    update: {},
    create: {
      id: "demo-note-maria",
      organizationId: organization.id,
      contactId: demoContact.id,
      leadId: demoLead.id,
      body: "Cliente interesada en automatizar seguimiento por WhatsApp.",
      createdByUserId: owner.id
    }
  });

  const demoConversation = await prisma.conversation.upsert({
    where: { id: "demo-conversation-maria" },
    update: {},
    create: {
      id: "demo-conversation-maria",
      organizationId: organization.id,
      contactId: demoContact.id,
      channel: "whatsapp",
      assignedUserId: owner.id,
      lastMessageAt: new Date()
    }
  });

  await prisma.message.upsert({
    where: { id: "demo-message-maria-inbound" },
    update: {},
    create: {
      id: "demo-message-maria-inbound",
      conversationId: demoConversation.id,
      direction: "inbound",
      channel: "whatsapp",
      type: "text",
      text: "Hola, quiero saber si pueden ayudarme a organizar mis clientes.",
      status: "delivered",
      rawPayload: { source: "seed" }
    }
  });

  await prisma.message.upsert({
    where: { id: "demo-message-maria-outbound" },
    update: {},
    create: {
      id: "demo-message-maria-outbound",
      conversationId: demoConversation.id,
      direction: "outbound",
      channel: "whatsapp",
      type: "text",
      text: "Hola Maria, claro. Podemos centralizar contactos, pipeline y seguimiento en un solo CRM.",
      status: "sent",
      sentByUserId: owner.id,
      rawPayload: { source: "seed" }
    }
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
