"use client"

import {Text} from "@mantine/core";
import {Shell} from "../../components/Shell";
import {SubmitPost} from "../../components/SubmitPost";
import Posts from "../../components/Posts";


export default function HomePage() {

    return (
        <Shell>
            <SubmitPost />
            <Posts />
        </Shell>
    );
}
