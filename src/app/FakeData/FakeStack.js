import { faker } from "@faker-js/faker";

function generateFakeStackID(postId) {
    return {
        "stackId": faker.string.uuid(),
        "size": faker.number.int({ min: 1, max: 30}),
    }

}

function generateFakeStackID(stackId) {

    const relatedStacks = []

    for (let i = 0; i < 10; i++) {
        relatedStacks.push(
            {
                "rel" : faker.helpers.arrayElement([ "disagree", "prediction", "funny", "evidence", "agree" ]),
                "stackId":  generateFakeStackID(stackId),
                "size": faker.number.int({ min: 1, max: 30}),
                "topPost":{
                    "postId": faker.string.uuid(),
                    "account":{
                        "id": faker.string.uuid(),
                        "username": faker.internet.userName(),
                        "display_name": faker.person.firstName(),
                    },
                },

            }
        );
    }

    return {
        "relatedStacks": relatedStacks,
    };
}

function generateSubStacks(){
    const subStacks = []

    for (let i = 0; i < 10; i++) {
        subStacks.push(
            {
                "substackId": generateFakeStackID(),
                "size": faker.number.int({ min: 1, max: 30}),
                "topPost":{
                    "postId": faker.string.uuid(),
                    "account":{
                        "id": faker.string.uuid(),
                        "username": faker.internet.userName(),
                        "display_name": faker.person.firstName(),
                    },
                },
            }
        );
    }

    return {
        "substack": subStacks,
    };
}

function GenerateSearchTermStack(searchTerm){
    const Stacks = []

    for (let i = 0; i < 10; i++) {
        Stacks.push(
            {
                "rel" : faker.helpers.arrayElement([ "disagree", "prediction", "funny", "evidence", "agree" ]),
                "stackId":  generateFakeStackID(stackId),
                "size": faker.number.int({ min: 1, max: 30}),
                "topPost":{
                    "postId": faker.string.uuid(),
                    "account":{
                        "id": faker.string.uuid(),
                        "username": faker.internet.userName(),
                        "display_name": faker.person.firstName(),
                    },
                },
            }
        );
    }

    return Stacks;
}

function generateAllPosts(){
    const posts = []

    for (let i = 0; i < 20; i++) {
        posts.push(
                {
                    "postId": faker.string.uuid(),
                    "account": {
                        "id": faker.string.uuid(),
                        "username": faker.internet.userName(),
                        "display_name": faker.person.firstName(),
                     }
                }
        );
    }


    return posts
}

function generateAllPosts(){
    const posts = []

    for (let i = 0; i < 20; i++) {
        posts.push(
                {
                    "postId": faker.string.uuid(),
                    "account": {
                        "id": faker.string.uuid(),
                        "username": faker.internet.userName(),
                        "display_name": faker.person.firstName(),
                     }
                }
        );
    }


    return posts
}
