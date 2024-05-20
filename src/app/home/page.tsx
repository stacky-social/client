"use client"

import {Shell} from "../../components/Shell";
import {SubmitPost} from "../../components/SubmitPost";
import Posts from "../../components/Posts";


export default function HomePage() {

    return (
        <Shell>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' }}>
                <div style={{ gridColumn: '1 / 2' }}>
                    <SubmitPost />
                    <Posts />
                </div>
                <div style={{ gridColumn: '2 / 3' }}>
                    {/* You can add other components here for the right half if needed */}
                </div>
            </div>
        </Shell>
    );
}
