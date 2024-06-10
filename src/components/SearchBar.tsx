// components/SearchBar.tsx
"use client";

import { useState } from 'react';
import { TextInput, Button, Box } from '@mantine/core';

interface SearchBarProps {
    onSearch: (query: string) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSearch }) => {
    const [query, setQuery] = useState<string>('');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
    };

    const handleSearch = () => {
        onSearch(query);
    };

    return (
        <Box>
            <TextInput
                placeholder="Search"
                value={query}
                onChange={handleInputChange}
                style={{ marginBottom: '10px' }}
            />
            <Button onClick={handleSearch} fullWidth>
                Search
            </Button>
        </Box>
    );
};

export default SearchBar;
