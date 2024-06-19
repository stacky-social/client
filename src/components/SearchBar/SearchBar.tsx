
import {TextInput, rem, Box, Paper, ActionIcon, useMantineTheme} from '@mantine/core';
import {IconArrowRight, IconSearch} from '@tabler/icons-react';

export default function SearchBar() {
    const theme = useMantineTheme();

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
                rightSection={
                    <ActionIcon size={32} radius="xl" color={theme.primaryColor} variant="filled">
                        <IconArrowRight style={{ width: rem(18), height: rem(18) }} stroke={1.5} />
                    </ActionIcon>
                }
            />
        </Paper>
    )

}
