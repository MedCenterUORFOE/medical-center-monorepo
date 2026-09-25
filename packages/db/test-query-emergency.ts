import 'dotenv/config';
import { prisma } from './index';

async function test() {
  try {
    console.log('Querying active emergency requests...');
    const activeRequests = await prisma.emergencyRequest.findMany({
      where: {
        status: {
          in: ['PENDING', 'DISPATCHED', 'ASSIGNED', 'ARRIVED']
        }
      },
      include: {
        requester: {
          select: { name: true, phone: true }
        },
        driver: {
          include: {
            user: {
              select: { name: true, phone: true }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    console.log('✅ Query succeeded!');
    console.log('Results count:', activeRequests.length);
    console.log('First result:', JSON.stringify(activeRequests[0], null, 2));
  } catch (err) {
    console.error('❌ Query failed with error:');
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
