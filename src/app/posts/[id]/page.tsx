"use client";

import {useRouter, useSearchParams} from "next/navigation";
import {Shell} from "../../../components/Shell";
import {Avatar, Group, Paper, Text} from "@mantine/core";
import {FakePosts} from '../../FakeData/FakePosts';



export default function PostView({params}: {params: {id: number, text: string}}) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const { id } = params;

    return (
        <Shell>
            <Paper withBorder radius="md"  mt={20} >
                <Group>
                    <Avatar
                        src="https://raw.githubusercontent.com/mantinedev/mantine/master/.demo/avatars/avatar-1.png"
                        alt="Jacob Warnhalter"
                        radius="xl"
                    />
                    <div>
                        <Text size="sm">Jacob Warnhalter</Text>
                        <Text size="xs" c="dimmed">
                            10 minutes ago
                        </Text>
                    </div>
                </Group>
                <Text pl={54} pt="sm" size="sm">
                    {FakePosts[id-1].text}
                </Text>
                <Text pl={54} pt="sm" size="sm">
                    Post Id: {id}
                </Text>
            </Paper>
        </Shell>
    );


}
