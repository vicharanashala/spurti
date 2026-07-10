# Spruti Marketplace - Implementation Guide

## Vision

**Spruti is not just a reward system—it is a decentralized marketplace where Spurti Points (SP) function as the currency for exchanging knowledge, skills, services, and contributions within an educational community.**

Instead of rewarding users with SP that eventually become meaningless, SP gains intrinsic value because it can be spent to solve real problems.

---

## Core Concept

Every student possesses different skills:

- Programming
- Mathematics
- UI/UX Design
- Research
- Public Speaking
- Documentation
- Debugging
- AI
- Video Editing
- Presentation Design

Students can monetize these skills using SP. Students who need help purchase these services using SP. The marketplace automatically connects buyers with the most suitable helpers.

---

## How It Works

### Step 1: Need Help
A student creates a request. Example: "Need help debugging my React application."

The student chooses:
- Category
- Difficulty
- Expected duration
- Deadline

### Step 2: Dynamic Pricing
Instead of fixed prices, Spruti estimates the SP value based on:
- Complexity
- Time required
- Skill rarity
- Demand
- Provider reputation
- Urgency

Example:
- Easy bug → 10 SP
- Medium project → 40 SP
- Research guidance → 80 SP
- Architecture review → 150 SP

The marketplace continuously adjusts pricing.

### Step 3: Marketplace Matching
The system recommends the best helpers based on:
- Skill score
- Previous ratings
- Completion rate
- Trust score
- Availability
- Similar completed tasks

### Step 4: Accepting Work
- The helper accepts.
- The buyer's SP is locked in escrow.
- After completion: Buyer approves. SP is transferred automatically.
- If disputed: Community moderators or AI review the evidence.

---

## Service Categories

Students can sell:
- Doubt clearing
- Coding help
- Debugging
- Assignment review
- Mock interviews
- Resume review
- Documentation
- UI design
- Research assistance
- Presentation creation
- Note making
- Language translation
- Peer tutoring
- Career guidance

Almost any educational contribution can become a marketplace service.

---

## Earning SP

Users earn SP by:
- Completing marketplace requests
- Winning hackathons
- Helping classmates
- Teaching sessions
- Creating documentation
- Reviewing projects
- Mentoring juniors
- Publishing educational resources
- Contributing to community projects

SP enters circulation through meaningful contributions.

---

## Spending SP

Users spend SP on:
- Expert help
- Mentorship
- Project reviews
- Interview practice
- Resume feedback
- Assignment guidance
- Code reviews
- Study groups
- Premium workshops
- Community events

This creates a self-sustaining economy.

---

## Reputation System

Every transaction updates:
- Trust Score
- Skill Ratings
- Response Time
- Completion Rate
- Quality Score
- Reliability

Higher reputation leads to:
- Better visibility
- Higher pricing
- Priority recommendations
- Exclusive opportunities

---

## Marketplace Features

- AI-powered helper recommendations
- Dynamic SP pricing
- Escrow payments
- Reputation-based search
- Skill verification
- Ratings and reviews
- Dispute resolution
- Service history
- Repeat customer rewards
- Personalized recommendations

---

## AI Features

The AI can:
- Estimate fair SP pricing.
- Recommend the best helper.
- Detect spam or low-quality services.
- Identify fraudulent transactions.
- Suggest learning resources before recommending paid help.
- Predict successful collaborations.

---

## Example Workflow

**Rahul** is struggling with Data Structures. He posts: "Need help understanding AVL Trees."

The AI estimates:
- Difficulty: Medium
- Duration: 45 minutes
- Recommended Price: 25 SP

Three helpers apply. Rahul selects **Abhishek**, whose profile shows:
- DSA Skill: 96
- Teaching Rating: 4.9/5
- Trust Score: 95

Rahul's 25 SP is held in escrow. After the session:
- Abhishek receives 25 SP.
- His teaching reputation increases.
- Rahul rates the session and gains knowledge.

No external money changes hands—only SP circulates.

---

## Long-Term Vision

As the marketplace grows, SP becomes more than points—it becomes the **economic engine of the community**.

Students earn SP by creating value and spend SP to accelerate their learning. This creates a **closed-loop educational economy** where knowledge, mentorship, and collaboration are continuously exchanged.

---

## Product Prompt

> **Design "Spruti Marketplace," a peer-to-peer educational marketplace where Spurti Points (SP) act as the primary digital currency. Students can earn SP by helping others, teaching, mentoring, reviewing projects, debugging code, creating documentation, or contributing to community activities. Students spend SP to request academic or technical assistance, project collaboration, interview preparation, design feedback, or mentorship. The platform should use AI to dynamically price services based on complexity, demand, urgency, provider reputation, and estimated effort. Implement escrow-based SP transactions, reputation and trust systems, ratings, dispute resolution, personalized helper recommendations, skill verification, fraud detection, and analytics. The objective is to transform SP from a simple reward mechanism into a meaningful community currency that powers a self-sustaining knowledge-sharing economy.**

---

## Step-by-Step Implementation Pathway

### Phase 1: Database Schema Design

1. **Create `services` collection** - Store marketplace service listings
   - Fields: title, description, category, subcategory, difficulty, estimatedDuration, deadline, price (estimated SP), priceRange (min-max), status (open/assigned/completed/cancelled/disputed), buyerId, providerId, escrowAmount, createdAt, updatedAt

2. **Create `serviceApplications` collection** - Track who applies to each service
   - Fields: serviceId, applicantId, coverMessage, proposedPrice, proposedDuration, status (pending/accepted/rejected), createdAt

3. **Create `transactions` extension** - Add marketplace-specific transaction types
   - Extend existing `sptransactions` or create `marketplace_transactions`
   - Types: escrow_hold, escrow_release, escrow_refund, marketplace_reward

4. **Create `reviews` collection** - Ratings and reviews for completed services
   - Fields: serviceId, reviewerId, revieweeId, rating (1-5), comment, tags[], response, createdAt

5. **Create `reputations` collection** - User reputation scores
   - Fields: userId, trustScore, skillRatings (by category), responseTime, completionRate, qualityScore, reliabilityScore, totalTransactions, updatedAt

6. **Create `serviceCategories` collection** - Categories and subcategories
   - Fields: name, icon, description, parentId, subcategories[], isActive

7. **Create `disputes` collection** - Dispute tracking
   - Fields: serviceId, raisedBy, reason, evidence[], status (open/under_review/resolved/closed), resolution, resolvedBy, createdAt, resolvedAt

8. **Create `skillProfiles` collection** - User skill expertise
   - Fields: userId, skills[], verifiedSkills[], endorsements[], portfolioLinks[], bio

---

### Phase 2: Backend API Endpoints

#### Service Management
1. `POST /api/marketplace/services` - Create a new service request
2. `GET /api/marketplace/services` - List services (with filters: category, difficulty, status, price range)
3. `GET /api/marketplace/services/:id` - Get service details
4. `PUT /api/marketplace/services/:id` - Update service
5. `DELETE /api/marketplace/services/:id` - Cancel/delete service
6. `POST /api/marketplace/services/:id/apply` - Apply to a service
7. `POST /api/marketplace/services/:id/accept` - Accept an applicant
8. `POST /api/marketplace/services/:id/complete` - Mark service as complete (triggers review)

#### AI Pricing
1. `POST /api/marketplace/estimate-price` - AI-powered price estimation
2. `GET /api/marketplace/pricing-history` - Historical pricing data

#### Matching & Recommendations
1. `GET /api/marketplace/recommended-helpers` - AI-recommended helpers for a service
2. `GET /api/marketplace/match-score` - Calculate match score between user and service

#### Escrow & Transactions
1. `POST /api/marketplace/escrow/hold` - Lock SP in escrow
2. `POST /api/marketplace/escrow/release` - Release escrow to provider
3. `POST /api/marketplace/escrow/refund` - Refund escrow to buyer

#### Reviews & Ratings
1. `POST /api/marketplace/reviews` - Submit a review
2. `GET /api/marketplace/reviews/:userId` - Get reviews for a user
3. `POST /api/marketplace/reviews/:id/respond` - Respond to a review

#### Reputation
1. `GET /api/marketplace/reputation/:userId` - Get user reputation
2. `POST /api/marketplace/reputation/update` - Update reputation scores
3. `GET /api/marketplace/skill-profile/:userId` - Get user skill profile
4. `PUT /api/marketplace/skill-profile` - Update skill profile

#### Disputes
1. `POST /api/marketplace/disputes` - Raise a dispute
2. `GET /api/marketplace/disputes/:id` - Get dispute details
3. `POST /api/marketplace/disputes/:id/resolve` - Resolve dispute (admin)
4. `POST /api/marketplace/disputes/:id/evidence` - Submit evidence

#### User Services
1. `GET /api/marketplace/my-services` - Services created by user
2. `GET /api/marketplace/my-applications` - Applications submitted by user
3. `GET /api/marketplace/my-ongoing` - Ongoing services (as buyer or provider)
4. `GET /api/marketplace/history` - Completed services history

#### Analytics & Dashboard
1. `GET /api/marketplace/analytics/overview` - Marketplace stats
2. `GET /api/marketplace/analytics/trends` - Pricing and demand trends
3. `GET /api/marketplace/analytics/popular-categories` - Category insights

---

### Phase 3: Frontend Components

#### Pages
1. **Marketplace Home** - Browse services, search, filters, category navigation
2. **Create Service** - Multi-step form to create service request
3. **Service Detail** - Full service info, applicant list, action buttons
4. **My Marketplace** - Dashboard showing user's services, applications, ongoing work
5. **Reputation Profile** - User's reputation, skills, reviews, completed services
6. **AI Price Estimator** - Tool to estimate service prices
7. **Admin Dispute Resolution** - Interface to handle disputes

#### Components
1. **ServiceCard** - Compact service preview for listings
2. **ServiceFilters** - Category, difficulty, price, status filters
3. **ApplicantList** - List of applicants with match scores
4. **EscrowStatus** - Visual escrow state indicator
5. **ReputationBadge** - Trust score and skill ratings display
6. **ReviewCard** - Review display with rating stars
7. **PriceEstimator** - AI-powered price calculator
8. **HelperRecommendation** - AI-recommended helper cards
9. **DisputePanel** - Dispute management interface
10. **TransactionHistory** - SP transaction ledger for marketplace

---

### Phase 4: Core Features Implementation

#### Dynamic Pricing Engine
1. Create pricing algorithm considering:
   - Base price by category
   - Difficulty multiplier (Easy: 1x, Medium: 2x, Hard: 4x)
   - Urgency multiplier (normal: 1x, urgent: 1.5x)
   - Provider reputation factor (0.8-1.2x)
   - Demand factor (based on category popularity)
   - Skill rarity factor
2. Train ML model on historical transaction data
3. Implement real-time price adjustment

#### AI Helper Recommendation
1. Build matching algorithm based on:
   - Skill score in required category
   - Overall trust score
   - Completion rate
   - Response time average
   - Similar task completion history
   - Availability status
2. Implement collaborative filtering
3. Add personalized recommendations based on past interactions

#### Escrow System
1. When service is accepted: deduct SP from buyer, hold in escrow
2. On completion: release to provider
3. On cancellation: refund to buyer
4. On dispute: hold until resolution

#### Reputation System
1. Calculate trust score (0-100) based on:
   - Transaction completion rate (40%)
   - Rating average (30%)
   - Response time (10%)
   - Dispute rate (20%)
2. Calculate per-skill ratings (0-100)
3. Update scores after each transaction
4. Implement decay for inactive users

#### Fraud Detection
1. Flag suspicious patterns:
   - Same user accepting own requests
   - Unusual pricing (too high/low)
   - Rapid-fire transactions
   - Fake reviews detection
   - Escrow manipulation attempts
2. Implement rate limiting
3. Add manual review queue

---

### Phase 5: Integration Points

1. **Existing SP System Integration**
   - Use existing `sptransactions` for marketplace SP movement
   - Extend `students.totalSp` to include marketplace earnings/spending
   - Ensure ledger consistency

2. **Student Profile Integration**
   - Add marketplace-specific fields to student view
   - Show marketplace reputation alongside SP
   - Display skill profiles

3. **Leaderboard Integration**
   - Add marketplace category to leaderboard
   - Track "Top Helpers" ranking

4. **Notification System (Future)**
   - Notify users of new applications
   - Alert for deadline approaching
   - Remind to complete/review

---

### Phase 6: Testing & Deployment

1. **Testing**
   - Unit tests for pricing algorithm
   - Integration tests for escrow flows
   - User acceptance testing
   - Load testing for matching system

2. **Deployment Steps**
   - Add new environment variables (escrow account, AI service keys)
   - Run database migrations for new collections
   - Deploy backend changes
   - Build and deploy frontend
   - Configure nginx for new routes
   - Set up monitoring and alerts

3. **Post-Launch**
   - Monitor escrow transactions
   - Track dispute rates
   - Gather user feedback
   - Iterate on pricing model
   - Add new service categories

---

## Implementation Order (Priority)

### MVP (Phase 1-2, critical path)
1. Database schema for services, applications, escrow
2. Service creation and browsing
3. Application and acceptance flow
4. Escrow hold/release
5. Basic price estimation (rule-based, not ML)
6. Simple reputation display

### v1.1 (Phase 3-4)
1. AI price estimation
2. Helper recommendations
3. Review system
4. Dispute handling
5. Reputation calculation

### v2.0 (Phase 5-6)
1. Advanced matching algorithm
2. Fraud detection
3. Analytics dashboard
4. Notification system
5. Mobile optimization

---

## File Structure

```
Spurti/
├── server/
│   ├── server.js              # Add marketplace routes
│   ├── config.js              # Add marketplace config
│   ├── models/
│   │   ├── Service.js         # NEW
│   │   ├── ServiceApplication.js  # NEW
│   │   ├── Review.js          # NEW
│   │   ├── Reputation.js      # NEW
│   │   ├── Dispute.js         # NEW
│   │   └── ServiceCategory.js # NEW
│   ├── routes/
│   │   ├── marketplace.js     # NEW - all marketplace endpoints
│   │   └── admin.js           # Add dispute resolution
│   ├── services/
│   │   ├── pricingEngine.js   # NEW - AI pricing
│   │   ├── matchingEngine.js  # NEW - helper recommendations
│   │   ├── escrowService.js   # NEW - escrow management
│   │   └── reputationService.js # NEW - reputation calc
│   └── middleware/
│       ├── marketplaceAuth.js # NEW
│       └── fraudDetection.js  # NEW
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Marketplace.jsx      # NEW
│   │   │   ├── CreateService.jsx    # NEW
│   │   │   ├── ServiceDetail.jsx    # NEW
│   │   │   ├── MyMarketplace.jsx    # NEW
│   │   │   ├── ReputationProfile.jsx # NEW
│   │   │   └── DisputeResolution.jsx # NEW (admin)
│   │   ├── components/
│   │   │   ├── ServiceCard.jsx      # NEW
│   │   │   ├── ServiceFilters.jsx   # NEW
│   │   │   ├── PriceEstimator.jsx   # NEW
│   │   │   ├── EscrowStatus.jsx     # NEW
│   │   │   ├── ReputationBadge.jsx  # NEW
│   │   │   └── HelperCard.jsx       # NEW
│   │   └── context/
│   │       └── MarketplaceContext.jsx # NEW
│   └── App.jsx               # Add marketplace routes
├── data/
│   └── serviceCategories.json # NEW - initial categories
└── implementation.md         # This file
```

---

## Key Technical Decisions

1. **Pricing**: Start with rule-based pricing, add ML later
2. **Matching**: Use weighted scoring initially, improve with data
3. **Escrow**: Use existing SP system, extend with escrow states
4. **Reputation**: Calculate asynchronously, cache in Redis (future)
5. **Disputes**: Manual review first, AI assist later

---

## Dependencies to Add

- `algoliasearch` or similar for search (optional)
- `chart.js` for analytics
- Consider ML library for pricing model (future)