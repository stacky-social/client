import { faker } from "@faker-js/faker";

function generateAvatarURLs() {
    const baseAvatarURL = "https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-";
    const avatarCount = 10; // Total number of avatars you want
    const avatars = [];

    for (let i = 1; i <= avatarCount; i++) {
        avatars.push(`${baseAvatarURL}${i}.png`);
    }
    return avatars;
}

function generateReplies(depth, maxDepth) {
    if (depth > maxDepth) {
        return [];
    }

    const numberOfReplies = faker.number.int({ min: 1, max: 15}); // Random number of replies
    return Array.from({ length: numberOfReplies }, () => ({
        postId: faker.string.uuid(),
        text: faker.lorem.sentence(),
        author: faker.person.firstName(),
        avatar: faker.helpers.arrayElement(generateAvatarURLs()),
        replies: generateReplies(depth + 1, maxDepth) // Recursively generate replies
    }));
}

function generateFakePosts() {
    const numberOfPosts = 30; // You can adjust the number of posts

    const posts = Array.from({ length: numberOfPosts }, (_, index) => ({
        postId: faker.string.uuid(),
        text: faker.location.country(), // Example field, change as needed
        author: faker.person.firstName(),
        avatar: faker.helpers.arrayElement(generateAvatarURLs()),
        replies: generateReplies(1, 3) // Start with depth 1 and go up to 3 levels deep
    }));

    return posts;
}

const FakePosts = generateFakePosts();
export default FakePosts;
