import { TwitterApi } from 'twitter-api-v2';
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Types ---
interface Post {
    id: number;
    type: 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night';
    content: string;
    reply?: string;
    posted: boolean;
    postedAt?: string;
}

interface PostsData {
    posts: Post[];
}

// --- X API Client ---
function createClient(): TwitterApi {
    const apiKey = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_KEY_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        throw new Error(
            '❌ API keys not found. Set X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET in .env'
        );
    }

    return new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken: accessToken,
        accessSecret: accessSecret,
    });
}

// --- Helper Functions ---
function randomDelay(minMinutes: number, maxMinutes: number): Promise<void> {
    const delayMs = Math.floor(Math.random() * (maxMinutes - minMinutes + 1) + minMinutes) * 60 * 1000;
    console.log(`🎲 Random delay: ${Math.floor(delayMs / 1000 / 60)} minutes (${delayMs}ms)`);
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

// --- Post Type Selection ---
function getPostType(): Post['type'] {
    // Allow override via env
    const override = process.env.POST_TYPE as Post['type'] | undefined;
    if (override && ['morning', 'lunch', 'afternoon', 'evening', 'night'].includes(override)) {
        return override;
    }

    // Auto-select based on JST hour
    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;

    // 07:30, 10:00 -> morning
    if (jstHour >= 5 && jstHour < 11) return 'morning';
    // 12:00 -> lunch
    if (jstHour >= 11 && jstHour < 14) return 'lunch';
    // 15:00 -> afternoon
    if (jstHour >= 14 && jstHour < 17) return 'afternoon';
    // 18:00 -> evening
    if (jstHour >= 17 && jstHour < 19) return 'evening';
    // 20:00, 22:30 -> night
    return 'night';
}

// --- Data Management ---
function loadPosts(): PostsData {
    const dataPath = join(__dirname, '..', 'data', 'posts.json');
    const raw = readFileSync(dataPath, 'utf-8');
    return JSON.parse(raw) as PostsData;
}

function savePosts(data: PostsData): void {
    const dataPath = join(__dirname, '..', 'data', 'posts.json');
    writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
}

function selectNextPost(data: PostsData, type: Post['type']): Post | null {
    const available = data.posts.filter((p) => p.type === type && !p.posted);
    if (available.length === 0) return null;
    return available[0];
}

function markAsPosted(data: PostsData, postId: number): void {
    const post = data.posts.find((p) => p.id === postId);
    if (post) {
        post.posted = true;
        post.postedAt = new Date().toISOString();
    }
}

// --- Main ---
async function main(): Promise<void> {
    const isDryRun = process.argv.includes('--dry-run');

    console.log(`\n🤖 SNS Auto Poster`);
    console.log(`📅 ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);

    if (!isDryRun) {
        // Random delay 1-5 minutes to avoid bot detection
        await randomDelay(1, 5);
    }

    const postType = getPostType();
    console.log(`📝 Post type: ${postType}`);
    console.log(`${isDryRun ? '🧪 DRY RUN MODE' : '🚀 LIVE MODE'}\n`);

    // Load posts
    const data = loadPosts();
    const post = selectNextPost(data, postType);

    if (!post) {
        console.log(`⚠️ No unposted "${postType}" content available.`);
        console.log(`   Add more posts to data/posts.json`);
        process.exit(0);
    }

    console.log(`📋 Selected post #${post.id}:`);
    console.log(`   "${post.content.substring(0, 80)}..."\n`);

    if (isDryRun) {
        console.log('✅ Dry run complete. No tweet was sent.');
        if (post.reply) {
            console.log(`   (Would have posted reply: "${post.reply.substring(0, 50)}...")`);
        }
        return;
    }

    // Send tweet
    try {
        const client = createClient();
        const result = await client.v2.tweet(post.content);

        console.log(`✅ Tweet posted successfully!`);
        console.log(`   ID: ${result.data.id}`);
        console.log(`   URL: https://x.com/ken_ittech/status/${result.data.id}`);

        // Handle reply (thread)
        if (post.reply) {
            console.log(`⏳ Waiting 2 seconds before posting reply...`);
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
                const replyResult = await client.v2.reply(post.reply, result.data.id);
                console.log(`✅ Reply posted successfully!`);
                console.log(`   Reply ID: ${replyResult.data.id}`);
            } catch (replyError: unknown) {
                console.error(`⚠️ Failed to post reply (main tweet succeeded):`, replyError);
            }
        }

        // Mark as posted
        markAsPosted(data, post.id);
        savePosts(data);
        console.log(`💾 Post #${post.id} marked as posted.`);
    } catch (error: unknown) {
        const err = error as { code?: number; data?: { detail?: string; title?: string }; message?: string };
        const detail = err.data?.detail || '';

        // Handle duplicate content - mark as posted and continue
        if (err.code === 403 && detail.includes('duplicate')) {
            console.log(`⚠️ Post #${post.id} was already posted (duplicate content). Marking as posted.`);
            markAsPosted(data, post.id);
            savePosts(data);
            console.log(`💾 Post #${post.id} marked as posted.`);
            return;
        }

        console.error(`❌ Failed to post tweet:`);
        console.error(`   Code: ${err.code}`);
        console.error(`   Data:`, JSON.stringify(err.data, null, 2));
        process.exit(1);
    }
}

main();
