
import {TextInput, rem, Box, Paper} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';

export default function SearchBar() {


    const icon = <IconSearch style={{ width: rem(16), height: rem(16) }} />;

    return (

        <Paper
            withBorder
            p="md"
            mb="lg"
        >
            <TextInput
                size="lg"
                radius="lg"
                placeholder="Search or Paste URL"
                leftSection={icon}
            />
        </Paper>
    )

}
