import { TwitterApi } from 'twitter-api-v2';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateImage, CardData } from './generate-image.js';

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
    image?: CardData;
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
    const override = process.env.POST_TYPE as Post['type'] | undefined;
    if (override && ['morning', 'lunch', 'afternoon', 'evening', 'night'].includes(override)) {
        return override;
    }

    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;

    if (jstHour >= 5 && jstHour < 11) return 'morning';
    if (jstHour >= 11 && jstHour < 14) return 'lunch';
    if (jstHour >= 14 && jstHour < 17) return 'afternoon';
    if (jstHour >= 17 && jstHour < 19) return 'evening';
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
        await randomDelay(1, 5);
    }

    const postType = getPostType();
    console.log(`📝 Post type: ${postType}`);
    console.log(`${isDryRun ? '🧪 DRY RUN MODE' : '🚀 LIVE MODE'}\n`);

    const data = loadPosts();
    const post = selectNextPost(data, postType);

    if (!post) {
        console.log(`⚠️ No unposted "${postType}" content available.`);
        process.exit(0);
    }

    console.log(`📋 Selected post #${post.id}:`);
    console.log(`   "${post.content.substring(0, 80)}..."\n`);

    // Generate image if card data is defined
    let imagePath: string | null = null;
    if (post.image) {
        imagePath = join(__dirname, '..', 'media', `post-${post.id}.png`);
        console.log(`🎨 Generating image...`);
        await generateImage(post.image, imagePath);
        console.log(`✅ Image generated: ${imagePath}`);
    }

    if (isDryRun) {
        console.log('✅ Dry run complete. No tweet was sent.');
        if (post.reply) {
            console.log(`   (Would have posted reply: "${post.reply.substring(0, 50)}...")`);
        }
        if (imagePath) {
            console.log(`   (Would have attached image: ${imagePath})`);
        }
        return;
    }

    // Send tweet
    try {
        const client = createClient();

        // Upload image if exists
        let mediaId: string | undefined;
        if (imagePath && existsSync(imagePath)) {
            console.log(`📤 Uploading image...`);
            mediaId = await client.v1.uploadMedia(imagePath);
            console.log(`✅ Image uploaded: media_id=${mediaId}`);
        }

        const tweetOptions = mediaId ? { media: { media_ids: [mediaId] } } : {};
        const result = await client.v2.tweet(post.content, tweetOptions);

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
        } else {
            // Randomly attach a promotional CTA (30% chance)
            const ctaRate = 0.3;
            if (Math.random() < ctaRate) {
                const ctas = [
                    "👇私が未経験からITパスポートに一発合格した時に使った神テキストはこちら。図解が多くて初心者に超おすすめです📚\nhttps://hb.afl.rakuten.co.jp/ichiba/3ee12345.6789abcd.3ee12346.ef012345/",
                    "👇エンジニアの肩こり対策に買ったら人生変わったPCスタンド。目線が上がって最高です💻\nhttps://hb.afl.rakuten.co.jp/ichiba/example_stand",
                    "👇デスク周りの配線地獄から解放してくれたAnkerのマグネットケーブルホルダー。もっと早く買えばよかった⚡️\nhttps://hb.afl.rakuten.co.jp/ichiba/example_cable"
                ];
                const randomCta = ctas[Math.floor(Math.random() * ctas.length)];
                console.log(`🎁 Posting promotional CTA...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                try {
                    const ctaResult = await client.v2.reply(randomCta, result.data.id);
                    console.log(`✅ Promotional CTA posted: ${ctaResult.data.id}`);
                } catch (ctaError: unknown) {
                    console.error(`⚠️ Failed to post CTA:`, ctaError);
                }
            }
        }

        // Clean up temp image
        if (imagePath && existsSync(imagePath)) {
            unlinkSync(imagePath);
        }

        markAsPosted(data, post.id);
        savePosts(data);
        console.log(`💾 Post #${post.id} marked as posted.`);
    } catch (error: unknown) {
        const err = error as { code?: number; data?: { detail?: string; title?: string }; message?: string };
        const detail = err.data?.detail || '';

        if (err.code === 403 && detail.includes('duplicate')) {
            console.log(`⚠️ Duplicate content detected. Marking as posted.`);
            markAsPosted(data, post.id);
            savePosts(data);
            return;
        }

        console.error(`❌ Failed to post tweet:`);
        console.error(`   Code: ${err.code}`);
        console.error(`   Data:`, JSON.stringify(err.data, null, 2));
        process.exit(1);
    }
}

main();
