"use client";
import Posts from '../../../components/Posts/Posts';

export default function Liked() {
    return (
        <Posts source="liked" loadStackInfo showSubmitAndSearch showLoadMore={false} />
    );
}
