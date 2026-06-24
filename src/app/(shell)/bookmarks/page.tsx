"use client";
import Posts from '../../../components/Posts/Posts';

export default function Bookmarks() {
    return (
        <Posts source="bookmarks" loadStackInfo showSubmitAndSearch showLoadMore={false} />
    );
}
