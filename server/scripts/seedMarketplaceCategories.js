import ServiceCategory from '../models/ServiceCategory.js';

const categories = [
  { name: 'Doubt Clearing', icon: '❓', description: 'Get your doubts clarified by experts', color: '#10b981', basePrice: 10, sortOrder: 1 },
  { name: 'Coding Help', icon: '💻', description: 'Programming assistance and code reviews', color: '#3b82f6', basePrice: 25, sortOrder: 2 },
  { name: 'Debugging', icon: '🐛', description: 'Fix bugs and issues in your code', color: '#ef4444', basePrice: 20, sortOrder: 3 },
  { name: 'Assignment Review', icon: '📝', description: 'Get feedback on your assignments', color: '#8b5cf6', basePrice: 15, sortOrder: 4 },
  { name: 'Mock Interviews', icon: '🎯', description: 'Practice interviews with peers', color: '#f59e0b', basePrice: 40, sortOrder: 5 },
  { name: 'Resume Review', icon: '📄', description: 'Get expert feedback on your resume', color: '#06b6d4', basePrice: 30, sortOrder: 6 },
  { name: 'Documentation', icon: '📚', description: 'Create or improve documentation', color: '#84cc16', basePrice: 15, sortOrder: 7 },
  { name: 'UI Design', icon: '🎨', description: 'UI/UX design assistance', color: '#ec4899', basePrice: 30, sortOrder: 8 },
  { name: 'Research Assistance', icon: '🔬', description: 'Help with research and projects', color: '#6366f1', basePrice: 35, sortOrder: 9 },
  { name: 'Presentation Creation', icon: '📊', description: 'Create stunning presentations', color: '#14b8a6', basePrice: 20, sortOrder: 10 },
  { name: 'Note Making', icon: '📒', description: 'Structured notes for any topic', color: '#a855f7', basePrice: 10, sortOrder: 11 },
  { name: 'Language Translation', icon: '🌐', description: 'Translate content between languages', color: '#f97316', basePrice: 15, sortOrder: 12 },
  { name: 'Peer Tutoring', icon: '👨‍🏫', description: 'One-on-one tutoring sessions', color: '#0ea5e9', basePrice: 20, sortOrder: 13 },
  { name: 'Career Guidance', icon: '🚀', description: 'Get career advice and mentorship', color: '#84cc16', basePrice: 35, sortOrder: 14 },
  { name: 'Mathematics', icon: '🔢', description: 'Math problem solving and tutoring', color: '#8b5cf6', basePrice: 15, sortOrder: 15 },
  { name: 'AI & Machine Learning', icon: '🤖', description: 'AI/ML project help and tutoring', color: '#ef4444', basePrice: 40, sortOrder: 16 },
  { name: 'Video Editing', icon: '🎬', description: 'Video editing and production help', color: '#f59e0b', basePrice: 25, sortOrder: 17 },
  { name: 'Public Speaking', icon: '🎤', description: 'Practice and improve speaking skills', color: '#06b6d4', basePrice: 20, sortOrder: 18 }
];

export async function seedCategories() {
  for (const cat of categories) {
    await ServiceCategory.findOneAndUpdate(
      { name: cat.name },
      cat,
      { upsert: true, new: true }
    );
  }
  console.log(`Seeded ${categories.length} service categories`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedCategories();
  process.exit(0);
}