import {
  PrismaClient,
  type ActivityType,
  type DocumentType,
  type ProjectStatus,
  type UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const STAGES = [
  'Discovery & Brief',
  'Requirement',
  'UI/UX Design',
  'Development',
  'QA & Testing',
  'UAT',
  'Deployment',
  'Maintenance',
];

const STAGE_DOCUMENTS = [
  ['MoM Kickoff.pdf', 'Project Brief.pdf'],
  ['SRS Document.pdf', 'User Story Backlog.xlsx'],
  ['Wireframe.fig', 'Design System.pdf'],
  ['Technical Spec.pdf', 'API Contract.pdf'],
  ['Test Plan.pdf', 'Bug Report.xlsx'],
  ['UAT Checklist.pdf', 'BAST 1.pdf'],
  ['Deployment Guide.pdf', 'Release Notes.pdf'],
  ['SLA Agreement.pdf', 'Maintenance Log.pdf'],
];

const clients = [
  {
    name: 'PT. ABC Retail',
    address: 'Jl. Jenderal Sudirman Kav. 52-53, Jakarta Selatan 12190',
    contactName: 'Dewi Lestari',
    contactRole: 'IT Manager',
    phone: '+62 812-3456-7890',
  },
  {
    name: 'Bank Nusantara',
    address: 'Menara Nusantara, Jl. MH Thamrin No. 5, Jakarta Pusat 10340',
    contactName: 'Andi Pratama',
    contactRole: 'Digital Product Lead',
    phone: '+62 811-2233-4455',
  },
  {
    name: 'PT. Sinar Jaya',
    address: 'Gedung Sinar Jaya Lt. 8, Jl. Gatot Subroto No. 21, Jakarta 12930',
    contactName: 'Maya Kusuma',
    contactRole: 'HR Director',
    phone: '+62 813-9988-7766',
  },
  {
    name: 'CV. Kreatif Media',
    address: 'Jl. Kemang Raya No. 12, Jakarta Selatan 12730',
    contactName: 'Rendi Saputra',
    contactRole: 'Founder',
    phone: '+62 812-7788-9900',
  },
  {
    name: 'PT. Kirim Cepat',
    address: 'Jl. Raya Bekasi Timur KM 18, Jakarta Timur 13910',
    contactName: 'Siti Rahma',
    contactRole: 'Operations Manager',
    phone: '+62 815-4455-6677',
  },
  {
    name: 'Toko Sejahtera',
    address: 'Jl. Pahlawan No. 45, Bandung 40123',
    contactName: 'Agus Wijaya',
    contactRole: 'Owner',
    phone: '+62 812-1010-2020',
  },
  {
    name: 'Klinik Sehat',
    address: 'Jl. Diponegoro No. 88, Surabaya 60241',
    contactName: 'dr. Nadia Putri',
    contactRole: 'Klinik Director',
    phone: '+62 811-3030-4040',
  },
  {
    name: 'PT. Maju Bersama',
    address: 'Gedung Maju Tower Lt. 12, Jl. TB Simatupang No. 9, Jakarta 12430',
    contactName: 'Hendra Gunawan',
    contactRole: 'Finance Director',
    phone: '+62 813-5566-7788',
  },
];

interface SeedProject {
  code: string;
  name: string;
  client: string;
  status: ProjectStatus;
  completedStages: number;
  dueDate: string;
  startDate: string;
}

const projects: SeedProject[] = [
  {
    code: 'PRJ-001',
    name: 'E-Commerce App',
    client: 'PT. ABC Retail',
    status: 'in_progress',
    completedStages: 3,
    dueDate: '2026-11-20',
    startDate: '2026-08-04',
  },
  {
    code: 'PRJ-002',
    name: 'Mobile Banking Revamp',
    client: 'Bank Nusantara',
    status: 'in_progress',
    completedStages: 5,
    dueDate: '2026-11-05',
    startDate: '2026-06-15',
  },
  {
    code: 'PRJ-003',
    name: 'HRIS Internal Portal',
    client: 'PT. Sinar Jaya',
    status: 'on_hold',
    completedStages: 2,
    dueDate: '2026-12-15',
    startDate: '2026-08-20',
  },
  {
    code: 'PRJ-004',
    name: 'Company Profile Website',
    client: 'CV. Kreatif Media',
    status: 'completed',
    completedStages: 8,
    dueDate: '2026-09-30',
    startDate: '2026-05-11',
  },
  {
    code: 'PRJ-005',
    name: 'Logistics Dashboard',
    client: 'PT. Kirim Cepat',
    status: 'in_progress',
    completedStages: 1,
    dueDate: '2027-01-10',
    startDate: '2026-10-01',
  },
  {
    code: 'PRJ-006',
    name: 'POS Integration',
    client: 'Toko Sejahtera',
    status: 'not_started',
    completedStages: 0,
    dueDate: '2027-02-01',
    startDate: '2026-11-15',
  },
  {
    code: 'PRJ-007',
    name: 'Healthcare Booking System',
    client: 'Klinik Sehat',
    status: 'in_progress',
    completedStages: 4,
    dueDate: '2026-11-28',
    startDate: '2026-07-07',
  },
  {
    code: 'PRJ-008',
    name: 'ERP Customization',
    client: 'PT. Maju Bersama',
    status: 'completed',
    completedStages: 8,
    dueDate: '2026-08-18',
    startDate: '2026-04-02',
  },
];

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function documentType(name: string): DocumentType {
  const extension = name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'pdf':
      return 'pdf';
    case 'xlsx':
    case 'csv':
      return 'spreadsheet';
    case 'png':
    case 'jpg':
      return 'image';
    case 'fig':
      return 'design';
    case 'doc':
    case 'docx':
      return 'document';
    default:
      return 'other';
  }
}

function mimeType(name: string): string {
  switch (documentType(name)) {
    case 'pdf':
      return 'application/pdf';
    case 'spreadsheet':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'design':
      return 'application/octet-stream';
    default:
      return 'application/octet-stream';
  }
}

async function seed(): Promise<void> {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.SEED_ALLOW_PRODUCTION !== 'true'
  ) {
    console.log(
      'Seed dilewati di production. Set SEED_ALLOW_PRODUCTION=true jika memang ingin seeding.',
    );
    return;
  }

  const password = process.env.SEED_DEFAULT_PASSWORD ?? 'Privis123!';
  const passwordHash = await bcrypt.hash(password, 12);

  const userSeeds: Array<{
    email: string;
    name: string;
    role: UserRole;
    division: string;
  }> = [
    {
      email: 'admin@privis.id',
      name: 'Admin PriVis',
      role: 'admin',
      division: 'Management',
    },
    { email: 'rina@privis.id', name: 'Rina', role: 'pm', division: 'PM' },
    {
      email: 'finance@privis.id',
      name: 'Finance',
      role: 'finance',
      division: 'Finance',
    },
    { email: 'qa@privis.id', name: 'QA', role: 'qa', division: 'QA' },
  ];

  const users = new Map<string, { id: string; name: string }>();
  for (const seedUser of userSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {
        name: seedUser.name,
        role: seedUser.role,
        division: seedUser.division,
        isActive: true,
        passwordHash,
      },
      create: {
        email: seedUser.email,
        name: seedUser.name,
        role: seedUser.role,
        division: seedUser.division,
        passwordHash,
      },
    });
    users.set(seedUser.email, { id: user.id, name: user.name });
  }

  const admin = users.get('admin@privis.id')!;
  const pm = users.get('rina@privis.id')!;
  const finance = users.get('finance@privis.id')!;
  const qa = users.get('qa@privis.id')!;

  const clientIds = new Map<string, string>();
  for (const seedClient of clients) {
    const existing = await prisma.client.findFirst({
      where: { name: seedClient.name },
    });
    const client = existing
      ? await prisma.client.update({
          where: { id: existing.id },
          data: seedClient,
        })
      : await prisma.client.create({ data: seedClient });
    clientIds.set(client.name, client.id);
  }

  const projectIds = new Map<string, string>();

  for (const seedProject of projects) {
    const clientId = clientIds.get(seedProject.client);
    if (!clientId) throw new Error(`Client ${seedProject.client} tidak ada.`);

    const currentStage =
      seedProject.status === 'not_started'
        ? 0
        : Math.min(seedProject.completedStages + 1, 8);

    const project = await prisma.project.upsert({
      where: { code: seedProject.code },
      update: {
        name: seedProject.name,
        clientId,
        status: seedProject.status,
        currentStage,
        startDate: new Date(seedProject.startDate),
        dueDate: new Date(seedProject.dueDate),
      },
      create: {
        code: seedProject.code,
        name: seedProject.name,
        clientId,
        status: seedProject.status,
        currentStage,
        startDate: new Date(seedProject.startDate),
        dueDate: new Date(seedProject.dueDate),
      },
    });
    projectIds.set(project.code, project.id);

    for (let stageNo = 1; stageNo <= STAGES.length; stageNo += 1) {
      const isCompleted = stageNo <= seedProject.completedStages;
      await prisma.projectStage.upsert({
        where: {
          projectId_stageNo: { projectId: project.id, stageNo },
        },
        update: {
          title: STAGES[stageNo - 1],
          isCompleted,
          completedAt: isCompleted
            ? daysAgo((seedProject.completedStages - stageNo) * 9 + 3)
            : null,
        },
        create: {
          projectId: project.id,
          stageNo,
          title: STAGES[stageNo - 1],
          isCompleted,
          completedAt: isCompleted
            ? daysAgo((seedProject.completedStages - stageNo) * 9 + 3)
            : null,
        },
      });
    }

    const existingDocuments = await prisma.document.count({
      where: { projectId: project.id },
    });

    if (existingDocuments === 0) {
      const documents = [] as Array<{
        projectId: string;
        stageId: string;
        name: string;
        type: DocumentType;
        mimeType: string;
        sizeBytes: number;
        storageKey: string;
        uploadedById: string;
        uploadedAt: Date;
      }>;

      const stages = await prisma.projectStage.findMany({
        where: { projectId: project.id },
        orderBy: { stageNo: 'asc' },
      });

      for (const stage of stages) {
        const isCurrent =
          seedProject.status !== 'not_started' &&
          seedProject.status !== 'completed' &&
          stage.stageNo === currentStage;
        const names = stage.isCompleted
          ? STAGE_DOCUMENTS[stage.stageNo - 1]
          : isCurrent
            ? [STAGE_DOCUMENTS[stage.stageNo - 1][0]]
            : [];

        names.forEach((name, index) => {
          const uploader = index % 2 === 0 ? pm : finance;
          documents.push({
            projectId: project.id,
            stageId: stage.id,
            name,
            type: documentType(name),
            mimeType: mimeType(name),
            sizeBytes: 180000 + stage.stageNo * 12000 + index * 8000,
            storageKey: `seed/${project.code}/stage-${stage.stageNo}-${index + 1}-${name}`,
            uploadedById: uploader.id,
            uploadedAt: stage.completedAt
              ? new Date(stage.completedAt.getTime() - 86400000)
              : daysAgo(2 + index),
          });
        });
      }

      if (documents.length > 0) {
        await prisma.document.createMany({ data: documents });
      }
    }
  }

  const existingActivities = await prisma.activity.count();
  if (existingActivities === 0) {
    const activities: Array<{
      projectId: string;
      actorId: string;
      type: ActivityType;
      division: string;
      action: string;
      target: string;
      createdAt: Date;
    }> = [
      {
        projectId: projectIds.get('PRJ-006')!,
        actorId: pm.id,
        type: 'project_created',
        division: 'PM',
        action: 'membuat proyek baru',
        target: 'POS Integration',
        createdAt: daysAgo(0.03),
      },
      {
        projectId: projectIds.get('PRJ-001')!,
        actorId: finance.id,
        type: 'document_uploaded',
        division: 'Finance',
        action: 'mengunggah',
        target: 'MoM Kickoff.pdf',
        createdAt: daysAgo(0.09),
      },
      {
        projectId: projectIds.get('PRJ-001')!,
        actorId: qa.id,
        type: 'stage_completed',
        division: 'QA',
        action: 'menyelesaikan tahap',
        target: 'UI/UX Design',
        createdAt: daysAgo(0.2),
      },
      {
        projectId: projectIds.get('PRJ-003')!,
        actorId: pm.id,
        type: 'project_updated',
        division: 'PM',
        action: 'memperbarui status',
        target: 'HRIS Internal Portal menjadi On Hold',
        createdAt: daysAgo(0.5),
      },
      {
        projectId: projectIds.get('PRJ-002')!,
        actorId: finance.id,
        type: 'document_uploaded',
        division: 'Finance',
        action: 'mengunggah',
        target: 'UAT Checklist.pdf',
        createdAt: daysAgo(1),
      },
    ];

    await prisma.activity.createMany({ data: activities });
  }

  console.log('Seed selesai.');
  console.log('Login: admin@privis.id / rina@privis.id / finance@privis.id / qa@privis.id');
  console.log(`Password default seed: ${password}`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
